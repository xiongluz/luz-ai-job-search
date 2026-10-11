import React, { useEffect, useMemo, useState } from "react";
import { recruitmentAdminApi, setRecruitmentAdminToken } from "./recruitmentAdminApi.js";

const tabs = [
  ["overview", "数据总览"],
  ["companies", "公司管理"],
  ["programs", "招聘项目"],
  ["positions", "岗位管理"],
  ["links", "投递链接"],
  ["referrals", "内推码"],
  ["import", "批量导入"],
  ["logs", "操作记录"],
];

const statusOptions = ["DRAFT", "PUBLISHED", "CLOSED", "ARCHIVED"];
const recruitmentTypes = ["CAMPUS", "INTERNSHIP", "CAMPUS_AND_INTERNSHIP", "OTHER"];

function emptyCompany() {
  return { id: "", nameZh: "", nameEn: "", slug: "", categoryCode: "", industry: "", companyType: "", description: "", officialWebsite: "", careerWebsite: "", logoUrl: "", needsReview: true, status: "DRAFT" };
}

function emptyProgram() {
  return { id: "", companyId: "", title: "", recruitmentType: "CAMPUS", graduationYear: "2027", startDate: "", endDate: "", targetAudience: "", summary: "", status: "DRAFT" };
}

function emptyPosition() {
  return { id: "", companyId: "", programId: "", positionName: "", department: "", locationText: "", workMode: "", positionCategory: "", employmentType: "校招", graduationYear: "2027", educationRequirement: "", majorRequirement: "", skillRequirement: "", salaryText: "", internshipDuration: "", weeklyAttendance: "", deadline: "", writtenExamRequired: false, conversionAvailable: false, description: "", status: "DRAFT" };
}

function emptyLink() {
  return { id: "", companyId: "", programId: "", positionId: "", url: "", linkType: "APPLICATION", label: "投递入口", official: true, valid: true, source: "", validUntil: "", status: "DRAFT" };
}

function emptyReferral() {
  return { id: "", companyId: "", programId: "", positionId: "", code: "", note: "", validityText: "", validUntil: "", valid: true, source: "", status: "DRAFT" };
}

export default function RecruitmentAdminPage({ navigate }) {
  const [tokenReady, setTokenReady] = useState(Boolean(sessionStorage.getItem("gqld-recruitment-admin-token")));
  const [login, setLogin] = useState({ username: "", password: "" });
  const [loginError, setLoginError] = useState("");
  const [tab, setTab] = useState("overview");
  const [dashboard, setDashboard] = useState(null);
  const [rows, setRows] = useState({ companies: [], programs: [], positions: [], links: [], referrals: [], logs: [] });
  const [forms, setForms] = useState({ company: emptyCompany(), program: emptyProgram(), position: emptyPosition(), link: emptyLink(), referral: emptyReferral() });
  const [notice, setNotice] = useState("");
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);

  async function loadAll() {
    const [dash, companies, programs, positions, links, referrals, logs] = await Promise.all([
      recruitmentAdminApi.dashboard(),
      recruitmentAdminApi.companies(),
      recruitmentAdminApi.programs(),
      recruitmentAdminApi.positions(),
      recruitmentAdminApi.links(),
      recruitmentAdminApi.referrals(),
      recruitmentAdminApi.auditLogs(),
    ]);
    setDashboard(dash);
    setRows({
      companies: companies.content ?? [],
      programs: programs.content ?? [],
      positions: positions.content ?? [],
      links: links.content ?? [],
      referrals: referrals.content ?? [],
      logs: logs.content ?? [],
    });
  }

  useEffect(() => {
    if (!tokenReady) return;
    loadAll().catch((error) => {
      setNotice(error.message || "管理员数据加载失败");
      if (/401|403|未登录|权限/.test(error.message || "")) {
        setRecruitmentAdminToken("");
        setTokenReady(false);
      }
    });
  }, [tokenReady]);

  async function submitLogin(event) {
    event.preventDefault();
    setLoginError("");
    try {
      const result = await recruitmentAdminApi.login(login);
      setRecruitmentAdminToken(result.token);
      setTokenReady(true);
    } catch (error) {
      setLoginError(error.message || "登录失败");
    }
  }

  async function save(kind, createAction, resetFactory, updateAction) {
    setNotice("");
    const { id, ...payload } = normalizePayload(forms[kind]);
    try {
      if (id && updateAction) await updateAction(id, payload);
      else await createAction(payload);
      setForms((current) => ({ ...current, [kind]: resetFactory() }));
      setNotice(id ? "更新成功，公开页面会在发布后自动读取最新数据。" : "保存成功，公开页面会在发布后自动读取最新数据。");
      await loadAll();
    } catch (error) {
      setNotice(error.message || "保存失败");
    }
  }

  async function previewImport() {
    if (!file) {
      setNotice("请选择 xlsx 或 csv 文件。");
      return;
    }
    try {
      setPreview(await recruitmentAdminApi.importPreview(file));
    } catch (error) {
      setNotice(error.message || "导入预览失败");
    }
  }

  async function commitImport() {
    if (!file) {
      setNotice("请选择 xlsx 或 csv 文件。");
      return;
    }
    try {
      const result = await recruitmentAdminApi.importCommit(file);
      setNotice(`导入完成：公司 ${result.createdCompanies}，项目 ${result.createdPrograms}，岗位 ${result.createdPositions}，跳过 ${result.skipped}。`);
      setFile(null);
      setPreview(null);
      await loadAll();
    } catch (error) {
      setNotice(error.message || "导入提交失败");
    }
  }

  if (!tokenReady) {
    return (
      <section className="recruitment-admin-page is-login">
        <form className="admin-login-panel" onSubmit={submitLogin}>
          <span>Recruitment Admin</span>
          <h1>招聘数据管理员后台</h1>
          <p>管理员账号与 BCrypt 密码 Hash 均由 8081 后端环境变量校验，前端不保存密码。</p>
          <label>用户名<input value={login.username} onChange={(e) => setLogin({ ...login, username: e.target.value })} autoComplete="username" /></label>
          <label>密码<input value={login.password} onChange={(e) => setLogin({ ...login, password: e.target.value })} type="password" autoComplete="current-password" /></label>
          {loginError && <p className="admin-alert">{loginError}</p>}
          <button type="submit">登录后台</button>
          <button type="button" onClick={() => navigate("/campus")}>返回校招页</button>
        </form>
      </section>
    );
  }

  return (
    <section className="recruitment-admin-page">
      <header className="admin-head">
        <div>
          <span>Recruitment Database</span>
          <h1>招聘数据管理员后台</h1>
        </div>
        <button type="button" onClick={() => { setRecruitmentAdminToken(""); setTokenReady(false); }}>退出登录</button>
      </header>
      <div className="admin-stats">
        <Stat label="公司数量" value={dashboard?.companyCount} />
        <Stat label="岗位数量" value={dashboard?.positionCount} />
        <Stat label="可投递岗位" value={dashboard?.openPositionCount} />
        <Stat label="已截止岗位" value={dashboard?.closedPositionCount} />
        <Stat label="今日新增" value={dashboard?.todayNewCount} />
        <Stat label="待审核" value={dashboard?.pendingReviewCount} />
      </div>
      <nav className="admin-tabs">{tabs.map(([key, label]) => <button key={key} className={tab === key ? "active" : ""} type="button" onClick={() => setTab(key)}>{label}</button>)}</nav>
      {notice && <p className="admin-alert">{notice}</p>}
      {tab === "overview" && <AdminTable title="最近岗位" rows={rows.positions} />}
      {tab === "companies" && <AdminForm title="公司管理" fields={companyFields} value={forms.company} onChange={(company) => setForms({ ...forms, company })} onSubmit={() => save("company", recruitmentAdminApi.createCompany, emptyCompany, recruitmentAdminApi.updateCompany)} rows={rows.companies} />}
      {tab === "programs" && <AdminForm title="招聘项目管理" fields={programFields} value={forms.program} onChange={(program) => setForms({ ...forms, program })} onSubmit={() => save("program", recruitmentAdminApi.createProgram, emptyProgram, recruitmentAdminApi.updateProgram)} rows={rows.programs} />}
      {tab === "positions" && <AdminForm title="岗位管理" fields={positionFields} value={forms.position} onChange={(position) => setForms({ ...forms, position })} onSubmit={() => save("position", recruitmentAdminApi.createPosition, emptyPosition, recruitmentAdminApi.updatePosition)} rows={rows.positions} actions={(row) => <><button type="button" onClick={() => recruitmentAdminApi.publishPosition(row.id).then(loadAll)}>发布</button><button type="button" onClick={() => recruitmentAdminApi.archivePosition(row.id).then(loadAll)}>下架</button></>} />}
      {tab === "links" && <AdminForm title="投递链接管理" fields={linkFields} value={forms.link} onChange={(link) => setForms({ ...forms, link })} onSubmit={() => save("link", recruitmentAdminApi.createLink, emptyLink, recruitmentAdminApi.updateLink)} rows={rows.links} />}
      {tab === "referrals" && <AdminForm title="内推码管理" fields={referralFields} value={forms.referral} onChange={(referral) => setForms({ ...forms, referral })} onSubmit={() => save("referral", recruitmentAdminApi.createReferral, emptyReferral, recruitmentAdminApi.updateReferral)} rows={rows.referrals} />}
      {tab === "import" && <ImportPanel file={file} setFile={setFile} preview={preview} onPreview={previewImport} onCommit={commitImport} />}
      {tab === "logs" && <AdminTable title="操作记录" rows={rows.logs} />}
    </section>
  );
}

function Stat({ label, value }) {
  return <article><span>{label}</span><strong>{value ?? "--"}</strong></article>;
}

function AdminForm({ title, fields, value, onChange, onSubmit, rows, actions }) {
  return (
    <div className="admin-work-grid">
      <form className="admin-editor" onSubmit={(event) => { event.preventDefault(); onSubmit(); }}>
        <h2>{title}</h2>
        <div className="admin-form-grid">
          {fields.map((field) => <Field key={field.key} field={field} value={value[field.key]} onChange={(next) => onChange({ ...value, [field.key]: next })} />)}
        </div>
        <button type="submit">{value.id ? "更新记录" : "保存草稿"}</button>
      </form>
      <AdminTable title="数据列表" rows={rows} actions={actions} />
    </div>
  );
}

function Field({ field, value, onChange }) {
  if (field.type === "textarea") return <label className="admin-wide">{field.label}<textarea value={value || ""} onChange={(e) => onChange(e.target.value)} rows={3} /></label>;
  if (field.type === "select") return <label>{field.label}<select value={value || ""} onChange={(e) => onChange(e.target.value)}>{field.options.map((option) => <option key={option} value={option}>{option}</option>)}</select></label>;
  if (field.type === "checkbox") return <label className="admin-checkbox"><input type="checkbox" checked={Boolean(value)} onChange={(e) => onChange(e.target.checked)} />{field.label}</label>;
  return <label>{field.label}<input type={field.type || "text"} value={value || ""} onChange={(e) => onChange(e.target.value)} /></label>;
}

function AdminTable({ title, rows = [], actions }) {
  return (
    <section className="admin-table-panel">
      <h2>{title}</h2>
      <div className="admin-table-scroll">
        <table>
          <thead><tr><th>ID</th><th>名称</th><th>公司</th><th>状态</th><th>更新时间</th><th>操作</th></tr></thead>
          <tbody>{rows.length ? rows.map((row) => <tr key={row.id}><td>{row.id}</td><td>{row.title || row.nameZh || row.positionName || row.detail || row.sourceKey || "-"}</td><td>{row.companyName || row.displayName || "-"}</td><td>{row.status || row.action || "-"}</td><td>{formatDate(row.updatedAt || row.createdAt)}</td><td>{actions ? actions(row) : "-"}</td></tr>) : <tr><td colSpan="6">暂无数据</td></tr>}</tbody>
        </table>
      </div>
    </section>
  );
}

function ImportPanel({ file, setFile, preview, onPreview, onCommit }) {
  return (
    <section className="admin-table-panel">
      <h2>Excel / CSV 批量导入</h2>
      <div className="admin-import-row">
        <input type="file" accept=".xlsx,.csv" onChange={(e) => setFile(e.target.files?.[0] || null)} />
        <button type="button" onClick={onPreview}>解析预览</button>
        <button type="button" onClick={onCommit} disabled={!preview || (preview.errors?.length || 0) > 0}>确认导入</button>
      </div>
      {preview && <><p>新增 {preview.newCount}，重复 {preview.duplicateCount}，错误 {preview.errors?.length || 0}</p><AdminTable title="错误行" rows={(preview.errors || []).map((item, index) => ({ id: index + 1, title: `第 ${item.rowNumber} 行 ${item.field}`, companyName: item.message, status: "ERROR" }))} /></>}
    </section>
  );
}

function normalizePayload(payload) {
  return Object.fromEntries(Object.entries(payload).map(([key, value]) => {
    if (value === "") return [key, null];
    if (["id", "companyId", "programId", "positionId", "graduationYear"].includes(key) && value != null) return [key, Number(value)];
    return [key, value];
  }));
}

function formatDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

const companyFields = [
  { key: "id", label: "编辑ID（留空新增）", type: "number" },
  { key: "nameZh", label: "中文名" }, { key: "nameEn", label: "英文名" }, { key: "slug", label: "slug" },
  { key: "categoryCode", label: "公司分类" }, { key: "industry", label: "行业" }, { key: "companyType", label: "企业性质" },
  { key: "officialWebsite", label: "官网", type: "url" }, { key: "careerWebsite", label: "招聘官网", type: "url" },
  { key: "logoUrl", label: "Logo", type: "url" }, { key: "status", label: "状态", type: "select", options: statusOptions },
  { key: "needsReview", label: "需要人工复核", type: "checkbox" }, { key: "description", label: "公司简介", type: "textarea" },
];
const programFields = [
  { key: "id", label: "编辑ID（留空新增）", type: "number" },
  { key: "companyId", label: "公司ID", type: "number" }, { key: "title", label: "项目名称" }, { key: "recruitmentType", label: "招聘类别", type: "select", options: recruitmentTypes },
  { key: "graduationYear", label: "招聘届次", type: "number" }, { key: "startDate", label: "开始日期", type: "date" }, { key: "endDate", label: "截止日期", type: "date" },
  { key: "status", label: "状态", type: "select", options: statusOptions }, { key: "targetAudience", label: "面向人群", type: "textarea" }, { key: "summary", label: "项目介绍", type: "textarea" },
];
const positionFields = [
  { key: "id", label: "编辑ID（留空新增）", type: "number" },
  { key: "companyId", label: "公司ID", type: "number" }, { key: "programId", label: "项目ID", type: "number" }, { key: "positionName", label: "岗位名称" },
  { key: "department", label: "部门" }, { key: "locationText", label: "城市" }, { key: "workMode", label: "办公方式" },
  { key: "positionCategory", label: "岗位类型" }, { key: "employmentType", label: "招聘类型" }, { key: "graduationYear", label: "届次", type: "number" },
  { key: "educationRequirement", label: "学历要求" }, { key: "majorRequirement", label: "专业要求" }, { key: "skillRequirement", label: "技能要求" },
  { key: "salaryText", label: "薪资" }, { key: "internshipDuration", label: "实习周期" }, { key: "weeklyAttendance", label: "每周出勤" },
  { key: "deadline", label: "截止时间", type: "date" }, { key: "writtenExamRequired", label: "需要笔试", type: "checkbox" }, { key: "conversionAvailable", label: "可转正", type: "checkbox" },
  { key: "status", label: "状态", type: "select", options: statusOptions }, { key: "description", label: "岗位描述", type: "textarea" },
];
const linkFields = [
  { key: "id", label: "编辑ID（留空新增）", type: "number" },
  { key: "companyId", label: "公司ID", type: "number" }, { key: "programId", label: "项目ID", type: "number" }, { key: "positionId", label: "岗位ID", type: "number" },
  { key: "url", label: "投递链接", type: "url" }, { key: "label", label: "标签" }, { key: "linkType", label: "类型" },
  { key: "validUntil", label: "有效期", type: "date" }, { key: "source", label: "来源" }, { key: "valid", label: "有效", type: "checkbox" }, { key: "official", label: "官方", type: "checkbox" },
  { key: "status", label: "状态", type: "select", options: statusOptions },
];
const referralFields = [
  { key: "id", label: "编辑ID（留空新增）", type: "number" },
  { key: "companyId", label: "公司ID", type: "number" }, { key: "programId", label: "项目ID", type: "number" }, { key: "positionId", label: "岗位ID", type: "number" },
  { key: "code", label: "内推码" }, { key: "note", label: "内推说明", type: "textarea" }, { key: "validityText", label: "有效期说明" },
  { key: "validUntil", label: "有效期", type: "date" }, { key: "source", label: "来源" }, { key: "valid", label: "有效", type: "checkbox" },
  { key: "status", label: "状态", type: "select", options: statusOptions },
];
