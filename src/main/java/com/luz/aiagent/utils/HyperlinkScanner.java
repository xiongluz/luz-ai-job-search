package com.luz.aiagent.utils;

import lombok.extern.slf4j.Slf4j;
import org.w3c.dom.Document;
import org.w3c.dom.Element;
import org.w3c.dom.NamedNodeMap;
import org.w3c.dom.Node;
import org.w3c.dom.NodeList;

import javax.xml.parsers.DocumentBuilder;
import javax.xml.parsers.DocumentBuilderFactory;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;
import java.util.zip.ZipOutputStream;

@Slf4j
public class HyperlinkScanner {

    // .rels 里 Target="..." 的 URL
    private static final Pattern RELS_TARGET = Pattern.compile("Target=\"([^\"]*)\"");

    private HyperlinkScanner() {
    }

    /**
     * 直接解析 xlsx 内部 XML 提取单元格超链接，绕开 POI 打开工作簿时的 URI 严格校验。
     * 背景：某些外部超链接 URL 含 ^、[、] 等字符，POI 解析 .rels 时抛 URISyntaxException。
     *
     * @param zip       原始 xlsx 字节（未经过 sanitize）
     * @param sheetIndex sheet 下标
     * @return Map<表头名, Map<0-based 行号, 原始超链接地址>>
     */
    public static Map<String, Map<Integer, String>> scanByHeader(byte[] zip, int sheetIndex) {
        try {
            List<String> shared = readSharedStrings(zip);
            String sheetPath = resolveSheetPath(zip, sheetIndex);
            if (sheetPath == null) {
                log.warn("找不到第 {} 个 sheet，跳过超链接扫描", sheetIndex);
                return new HashMap<>();
            }
            Map<String, String> rels = readHyperlinkRels(zip, sheetPath);
            Map<String, Map<Integer, String>> result = parseSheet(zip, sheetPath, rels, shared);

            if (result.isEmpty()) {
                log.warn("未扫描到任何超链接：请确认对应列是真正的单元格超链接");
            } else {
                result.forEach((name, byRow) -> log.info("超链接列[{}] 扫描到 {} 条", name, byRow.size()));
            }
            return result;
        } catch (Exception e) {
            throw new RuntimeException("扫描 Excel 超链接失败", e);
        }
    }

    /**
     * 把 .rels 里外部超链接 URL 的非法 URI 字符做百分号编码，生成 POI/EasyExcel 能打开的文件。
     * 注意：只用于喂给 EasyExcel 读普通字段，超链接地址应使用 {@link #scanByHeader} 的原始值。
     */
    public static byte[] sanitizeForPoi(byte[] zip) {
        try (ByteArrayOutputStream out = new ByteArrayOutputStream();
             ZipInputStream zis = new ZipInputStream(new ByteArrayInputStream(zip));
             ZipOutputStream zos = new ZipOutputStream(out)) {
            ZipEntry e;
            while ((e = zis.getNextEntry()) != null) {
                byte[] data = zis.readAllBytes();
                if (e.getName().endsWith(".rels")) {
                    data = sanitizeRels(data);
                }
                zos.putNextEntry(new ZipEntry(e.getName()));
                zos.write(data);
                zos.closeEntry();
            }
            return out.toByteArray();
        } catch (IOException e) {
            throw new RuntimeException("修复 Excel 超链接编码失败", e);
        }
    }

    private static byte[] sanitizeRels(byte[] data) {
        String xml = new String(data, StandardCharsets.UTF_8);
        Matcher m = RELS_TARGET.matcher(xml);
        StringBuffer sb = new StringBuffer();
        while (m.find()) {
            String encoded = encodeIllegalUriChars(m.group(1));
            m.appendReplacement(sb, Matcher.quoteReplacement("Target=\"" + encoded + "\""));
        }
        m.appendTail(sb);
        return sb.toString().getBytes(StandardCharsets.UTF_8);
    }

    private static String encodeIllegalUriChars(String url) {
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < url.length(); i++) {
            char c = url.charAt(i);
            if (isUriSafe(c)) {
                sb.append(c);
            } else {
                for (byte b : String.valueOf(c).getBytes(StandardCharsets.UTF_8)) {
                    sb.append('%');
                    sb.append(String.format("%02X", b & 0xFF));
                }
            }
        }
        return sb.toString();
    }

    private static boolean isUriSafe(char c) {
        if ((c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z') || (c >= '0' && c <= '9')) {
            return true;
        }
        return "-._~:/?#[]@!$&'()*+,;=%".indexOf(c) >= 0;
    }

    // ===== xlsx 内部解析 =====

    private static List<String> readSharedStrings(byte[] zip) throws Exception {
        String xml = readZipEntry(zip, "xl/sharedStrings.xml");
        List<String> list = new ArrayList<>();
        if (xml == null) {
            return list;
        }
        Document doc = parseXml(xml);
        NodeList sis = doc.getElementsByTagName("si");
        for (int i = 0; i < sis.getLength(); i++) {
            Element si = (Element) sis.item(i);
            StringBuilder sb = new StringBuilder();
            NodeList ts = si.getElementsByTagName("t");
            for (int j = 0; j < ts.getLength(); j++) {
                sb.append(ts.item(j).getTextContent());
            }
            list.add(sb.toString());
        }
        return list;
    }

    private static String resolveSheetPath(byte[] zip, int sheetIndex) throws Exception {
        String wb = readZipEntry(zip, "xl/workbook.xml");
        String wbRels = readZipEntry(zip, "xl/_rels/workbook.xml.rels");
        if (wb == null || wbRels == null) {
            return null;
        }
        Document doc = parseXml(wb);
        NodeList sheets = doc.getElementsByTagName("sheet");
        if (sheetIndex >= sheets.getLength()) {
            return null;
        }
        // sheet 元素的 r:id（localName 为 "id"）
        String targetRId = attrByName((Element) sheets.item(sheetIndex), "id");
        if (targetRId == null) {
            return null;
        }
        Document relsDoc = parseXml(wbRels);
        NodeList rels = relsDoc.getElementsByTagName("Relationship");
        for (int i = 0; i < rels.getLength(); i++) {
            Element rel = (Element) rels.item(i);
            if (targetRId.equals(attrByName(rel, "Id"))) {
                String target = attrByName(rel, "Target");
                if (target == null) {
                    return null;
                }
                if (target.startsWith("/")) {
                    target = target.substring(1);
                }
                return "xl/" + target;
            }
        }
        return null;
    }

    private static Map<String, String> readHyperlinkRels(byte[] zip, String sheetPath) throws Exception {
        String relsPath = relsPathOf(sheetPath);
        String xml = readZipEntry(zip, relsPath);
        Map<String, String> map = new HashMap<>();
        if (xml == null) {
            return map;
        }
        Document doc = parseXml(xml);
        NodeList rels = doc.getElementsByTagName("Relationship");
        for (int i = 0; i < rels.getLength(); i++) {
            Element rel = (Element) rels.item(i);
            String id = attrByName(rel, "Id");
            String target = attrByName(rel, "Target");
            if (id != null && target != null) {
                map.put(id, target);
            }
        }
        return map;
    }

    private static Map<String, Map<Integer, String>> parseSheet(
            byte[] zip, String sheetPath, Map<String, String> rels, List<String> shared) throws Exception {
        Map<String, Map<Integer, String>> result = new HashMap<>();
        String xml = readZipEntry(zip, sheetPath);
        if (xml == null) {
            return result;
        }
        Document doc = parseXml(xml);

        // 表头行：列号 -> 表头文字
        Map<Integer, String> colName = new HashMap<>();
        NodeList rows = doc.getElementsByTagName("row");
        if (rows.getLength() > 0) {
            Element header = (Element) rows.item(0);
            NodeList cells = header.getElementsByTagName("c");
            for (int i = 0; i < cells.getLength(); i++) {
                Element c = (Element) cells.item(i);
                String ref = c.getAttribute("r");
                String t = c.getAttribute("t");
                String text = cellText(c, t, shared);
                colName.put(colIndexFromRef(ref), text == null ? "" : text.trim());
            }
        }

        // 超链接：ref 坐标 + rId -> URL
        NodeList links = doc.getElementsByTagName("hyperlink");
        for (int i = 0; i < links.getLength(); i++) {
            Element link = (Element) links.item(i);
            String ref = link.getAttribute("ref");
            String rid = attrByName(link, "id");
            if (ref == null || rid == null) {
                continue;
            }
            String url = rels.get(rid);
            if (url == null || url.isBlank()) {
                continue;
            }
            int col = colIndexFromRef(ref);
            int excelRow = rowIndexFromRef(ref);
            String header = colName.get(col);
            if (header == null || header.isEmpty()) {
                continue;
            }
            // Excel 行号 1-based，转成与 EasyExcel getRowIndex() 一致的 0-based 物理行号
            result.computeIfAbsent(header, k -> new HashMap<>()).put(excelRow - 1, url);
        }
        return result;
    }

    private static String cellText(Element c, String t, List<String> shared) {
        if ("s".equals(t)) {
            NodeList vs = c.getElementsByTagName("v");
            if (vs.getLength() > 0) {
                try {
                    int idx = Integer.parseInt(vs.item(0).getTextContent().trim());
                    if (idx >= 0 && idx < shared.size()) {
                        return shared.get(idx);
                    }
                } catch (NumberFormatException ignored) {
                }
            }
            return "";
        }
        if ("inlineStr".equals(t)) {
            NodeList ts = c.getElementsByTagName("t");
            if (ts.getLength() > 0) {
                return ts.item(0).getTextContent();
            }
            return "";
        }
        NodeList vs = c.getElementsByTagName("v");
        if (vs.getLength() > 0) {
            return vs.item(0).getTextContent();
        }
        return "";
    }

    // ===== 工具 =====

    private static String relsPathOf(String sheetPath) {
        int slash = sheetPath.lastIndexOf('/');
        String dir = sheetPath.substring(0, slash);
        String name = sheetPath.substring(slash + 1);
        return dir + "/_rels/" + name + ".rels";
    }

    private static int colIndexFromRef(String ref) {
        int col = 0;
        for (int i = 0; i < ref.length(); i++) {
            char ch = ref.charAt(i);
            if (Character.isLetter(ch)) {
                col = col * 26 + (Character.toUpperCase(ch) - 'A' + 1);
            } else {
                break;
            }
        }
        return col - 1;
    }

    private static int rowIndexFromRef(String ref) {
        int i = 0;
        while (i < ref.length() && Character.isLetter(ref.charAt(i))) {
            i++;
        }
        return Integer.parseInt(ref.substring(i));
    }

    private static String attrByName(Element e, String localName) {
        NamedNodeMap attrs = e.getAttributes();
        for (int i = 0; i < attrs.getLength(); i++) {
            Node a = attrs.item(i);
            String name = a.getNodeName();
            if (name.equals(localName) || name.endsWith(":" + localName)) {
                return a.getNodeValue();
            }
        }
        return null;
    }

    private static String readZipEntry(byte[] zip, String entryName) throws IOException {
        try (ZipInputStream zis = new ZipInputStream(new ByteArrayInputStream(zip))) {
            ZipEntry e;
            while ((e = zis.getNextEntry()) != null) {
                if (entryName.equals(e.getName())) {
                    return new String(zis.readAllBytes(), StandardCharsets.UTF_8);
                }
            }
        }
        return null;
    }

    private static Document parseXml(String xml) throws Exception {
        DocumentBuilderFactory f = DocumentBuilderFactory.newInstance();
        f.setNamespaceAware(false);
        try {
            f.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true);
        } catch (Exception ignored) {
        }
        DocumentBuilder b = f.newDocumentBuilder();
        return b.parse(new ByteArrayInputStream(xml.getBytes(StandardCharsets.UTF_8)));
    }
}
