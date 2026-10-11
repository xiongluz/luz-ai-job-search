import React, { useEffect, useMemo, useState } from "react";
import { COMMUNITY_CATEGORIES, COMMUNITY_DRAFT_KEY, COMMUNITY_POST_TYPES, COMMUNITY_TOPIC_GROUPS } from "../communityMockData.js";
import { loadCommunityDraft, saveCommunityDraft } from "../communityApi.js";
import { splitTags, stripUnsafeText } from "./communityUtils.js";

const emptyForm = {
  postType: "experience",
  category: "interview",
  title: "",
  company: "",
  position: "",
  year: "2026",
  content: "",
  tagsText: "",
  anonymous: false,
  topic: "技术岗",
  imageUrls: [],
};

export default function CreateCommunityPostDialog({ open, onClose, onSubmit, showToast, initialCategory = "recommend", initialTopic = "" }) {
  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!open) return;
    const draft = loadCommunityDraft();
    if (draft) setForm({ ...emptyForm, ...draft });
    else setForm({ ...emptyForm, category: initialCategory === "recommend" ? "interview" : initialCategory, topic: initialTopic || "技术岗" });
    setDirty(false);
  }, [open, initialCategory, initialTopic]);

  useEffect(() => {
    if (open && dirty) saveCommunityDraft(form);
  }, [open, dirty, form]);

  const topics = useMemo(() => COMMUNITY_TOPIC_GROUPS[form.category] ?? COMMUNITY_TOPIC_GROUPS.recommend, [form.category]);

  if (!open) return null;

  function update(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
    setDirty(true);
  }

  function closeSafely() {
    if (dirty && !window.confirm("当前内容尚未发布，确认关闭吗？")) return;
    onClose();
  }

  async function submit(event) {
    event.preventDefault();
    const title = stripUnsafeText(form.title);
    const content = stripUnsafeText(form.content);
    if (title.length < 5 || title.length > 80) {
      showToast("标题需要 5-80 个字符");
      return;
    }
    if (!content) {
      showToast("正文不能为空");
      return;
    }
    setSubmitting(true);
    try {
      await onSubmit({ ...form, title, content, company: stripUnsafeText(form.company), position: stripUnsafeText(form.position), tags: splitTags(form.tagsText) });
      setDirty(false);
      window.localStorage.removeItem(COMMUNITY_DRAFT_KEY);
    } catch (err) {
      showToast(err.message || "发布失败，已保留输入内容");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="community-dialog-backdrop" role="presentation">
      <form className="community-create-dialog glass-panel" onSubmit={submit}>
        <div className="community-dialog-head"><div><h2>发布内容</h2><p>分享真实经验，或提出一个具体问题。</p></div><button type="button" onClick={closeSafely}>×</button></div>
        <div className="community-dialog-grid">
          <label><span>内容类型</span><select value={form.postType} onChange={(e) => update("postType", e.target.value)}>{COMMUNITY_POST_TYPES.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}</select></label>
          <label><span>所属分类</span><select value={form.category} onChange={(e) => update("category", e.target.value)}>{COMMUNITY_CATEGORIES.filter((item) => item.key !== "recommend").map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}</select></label>
          <label><span>话题</span><select value={form.topic} onChange={(e) => update("topic", e.target.value)}>{topics.map((topic) => <option key={topic} value={topic}>{topic}</option>)}</select></label>
          <label><span>年份</span><select value={form.year} onChange={(e) => update("year", e.target.value)}><option value="2026">2026</option><option value="2025">2025</option><option value="2024">2024</option><option value="2023">2023</option></select></label>
          <label className="wide"><span>标题 <small>{form.title.length}/80</small></span><input value={form.title} onChange={(e) => update("title", e.target.value)} placeholder="例如：字节跳动前端一面真实面经分享" maxLength={80} /></label>
          <label><span>公司</span><input value={form.company} onChange={(e) => update("company", e.target.value)} placeholder="请输入公司" /></label>
          <label><span>岗位</span><input value={form.position} onChange={(e) => update("position", e.target.value)} placeholder="请输入岗位" /></label>
          <label className="wide"><span>正文</span><textarea value={form.content} onChange={(e) => update("content", e.target.value)} placeholder="写清背景、过程、问题和结论。支持段落、列表、引用和链接，发布时会按纯文本安全展示。" rows={8} /></label>
          <label className="wide"><span>话题标签，最多 5 个</span><input value={form.tagsText} onChange={(e) => update("tagsText", e.target.value)} placeholder="前端开发 字节跳动 校招" /></label>
          <label className="community-switch"><input type="checkbox" checked={form.anonymous} onChange={(e) => update("anonymous", e.target.checked)} /> 匿名发布</label>
        </div>
        <div className="community-dialog-actions"><button type="button" onClick={() => { saveCommunityDraft(form); showToast("草稿已保存到本地"); }}>保存草稿</button><button type="button" onClick={closeSafely}>取消</button><button type="submit" className="community-primary-button" disabled={submitting}>{submitting ? "发布中..." : "确认发布"}</button></div>
      </form>
    </div>
  );
}
