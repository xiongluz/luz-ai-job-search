import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { createRoot } from "react-dom/client";
import brandUrl from "../brand.jpg";
import { EMPTY_JOB_FORM, QUICK_FILTERS, STAGES } from "./jobData.js";
import { loadStoredJobs, saveStoredJobs } from "./jobStore.js";
import {
  LAST_UPLOADED_RESUME_KEY,
  createRenamedFileName,
  createResumeRecord,
  formatFileSize,
  getSessionResumeUploads,
  saveSessionResumeUploads,
  uploadResumeFile,
  validateResumeFile,
} from "./resumeUploadService.js";
import { sendResumeAssistantMessage } from "./aiResumeService.js";
import ResumeBuilderWorkspace from "./ResumeBuilderWorkspace.jsx";
import ResumeDiagnosisWorkspace from "./ResumeDiagnosisWorkspace.jsx";
import QuestionBankPage from "./QuestionBankPage.jsx";
import BackStepButton from "./BackStepButton.jsx";
import CommunityPage from "./CommunityPage.jsx";
import RecruitmentAdminPage from "./RecruitmentAdminPage.jsx";
import JobMatchModal from "./JobMatchModal.jsx";
import JobMatchResultsPanel from "./JobMatchResultsPanel.jsx";
import WechatLoginModal from "./WechatLoginModal.jsx";
import {
  LOCAL_AUTH_BYPASS_ENABLED,
  createLocalDevSession,
  getWechatCurrentSession,
  logoutWechatSession,
} from "./wechatLoginApi.js";
import { setAuthToken, clearAuthToken } from "./authToken.js";
import { normalizePath, requiresLoginForPath } from "./authRoutePolicy.js";
import mentorWangPhoto from "./assets/mentors/wang-shuai.jpg";
import mentorYangPhoto from "./assets/mentors/yang-dan.jpg";
import mentorLiPhoto from "./assets/mentors/li-qiang.jpg";
import mentorWuPhoto from "./assets/mentors/wu-na.jpg";
import customServiceQr from "./assets/custom-service/service-qr.jpg";
import customPlanQr from "./assets/custom-service/custom-plan-qr.png";
import freeResourceQrNew from "./assets/custom-service/free-resource-qr-new.png";
import campusPlanQrNew from "./assets/custom-service/campus-plan-qr-new.png";
import socialPlanQrNew from "./assets/custom-service/social-plan-qr-new.png";
import careerGuidanceQrNew from "./assets/custom-service/career-guidance-qr-new.png";
import interviewGuidanceQrNew from "./assets/custom-service/interview-guidance-qr-new.png";
import salaryGuidanceQrNew from "./assets/custom-service/salary-guidance-qr-new.png";
import coachingQrNew from "./assets/custom-service/coaching-qr-new.jpg";
import matchActionIcon from "./assets/photo/4.png";
import resumeOptimizeIcon from "./assets/photo/6.png";
import favoriteOnIcon from "./assets/photo/7.png";
import favoriteOffIcon from "./assets/photo/8.png";
import {
  inferResumeDataFromText,
  loadResumeTemplateDraft,
  recommendResumeTemplates,
  resumeTemplates,
  saveResumeTemplateDraft,
} from "./resumeTemplateService.js";
import { aiJobMatch, getCampusRecruitmentList, getInternshipList, getRecruitmentPositionPage, getRecruitmentRecommendationPage, jobSmartMatching, searchCampusRecruitmentByDocument } from "./recruitmentApi.js";
import {
  cancelJobMatchReservation,
  getJobMatchNextBatch,
  getJobMatchReservedPositions,
  reserveJobMatchPosition,
} from "./jobMatchApi.js";
import {
  analyzeJobBatchMatch,
  analyzeJobMatch,
  parseJobDescription,
  parseJdImage,
  requestFieldSuggestions,
  requestResumeAdvice,
  saveJobRecord,
} from "./jobAiService.js";
import {
  formatSocialSalary,
  searchSocialRecruitmentJobs,
  socialRecruitmentOptions,
  sortSocialRecruitmentJobs,
} from "./socialRecruitmentService.js";
import "./styles.css";

const appRoutes = [
  { key: "dashboard", label: "AI简历", path: "/dashboard" },
  { key: "resume", label: "简历优化", path: "/resume" },
  { key: "question-bank", label: "AI面试", path: "/question-bank", nav: false },
  { key: "campus", label: "校招", path: "/campus" },
  { key: "recruitment-admin", label: "招聘数据管理员", path: "/recruitment-admin", nav: false },
  { key: "campus-new", label: "录入校招", path: "/campus/new", nav: false },
  { key: "campus-edit", label: "编辑校招", path: "/campus/:id/edit", nav: false },
  { key: "internship", label: "实习", path: "/internship" },
  { key: "internship-new", label: "录入实习", path: "/internships/new", nav: false },
  { key: "internship-edit", label: "编辑实习", path: "/internships/:id/edit", nav: false },
  { key: "social-recruitment", label: "社招", path: "/social-recruitment" },
  { key: "custom-service", label: "定制化服务", path: "/custom-service" },
  { key: "community", label: "求职攻略", path: "/community" },
  { key: "community-post", label: "社区帖子", path: "/community/post/:postId", nav: false },
  { key: "profile", label: "个人中心", path: "/profile" },
];

const topNavRoutes = appRoutes.filter((route) => !["resume", "profile"].includes(route.key) && route.nav !== false);
const topNavItems = [{ key: "home", label: "首页", path: "/" }, ...topNavRoutes];
const routePathByKey = Object.fromEntries(appRoutes.map((route) => [route.key, route.path]));
const OPTIMIZATION_REPORT_CACHE_PREFIX = "guangqi-careerai-optimization-report:";

function optimizationReportCacheKey(context, jd) {
  const identity = [context?.resumeId, context?.jobType, context?.jobId, context?.role, jd?.trim() ?? ""].join("::");
  return `${OPTIMIZATION_REPORT_CACHE_PREFIX}${encodeURIComponent(identity)}`;
}

function loadOptimizationReport(context, jd) {
  if (!context?.resumeId) return null;
  try {
    const raw = window.localStorage.getItem(optimizationReportCacheKey(context, jd));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveOptimizationReport(context, jd, plan) {
  if (!context?.resumeId || !plan) return;
  try {
    window.localStorage.setItem(optimizationReportCacheKey(context, jd), JSON.stringify(plan));
  } catch {
    // Report recovery is best effort when browser storage is unavailable.
  }
}

const legacyRouteMap = {
  "/workspace": "/dashboard",
  "/workspace/resume": "/resume",
  "/workspace/campus": "/campus",
  "/workspace/internship": "/internship",
  "/workspace/assistant": "/dashboard",
  "/workspace/interview": "/custom-service",
  "/assistant": "/dashboard",
  "/interview": "/custom-service",
  "/ai-interview": "/custom-service",
};

const heroSteps = [
  {
    key: "resume",
    label: "AI 简历分析",
    title: "AI 简历分析",
    description: "解析经历、定位短板、给出可执行的改写建议。",
    metric: "86",
    unit: "分",
  },
  {
    key: "match",
    label: "岗位匹配",
    title: "岗位匹配",
    description: "把 JD 要求映射到简历证据，找出真正值得投递的机会。",
    metric: "92",
    unit: "%",
  },
  {
    key: "interview",
    label: "AI 面试训练",
    title: "AI 面试训练",
    description: "围绕目标岗位生成追问，并复盘回答结构与表达质量。",
    metric: "12",
    unit: "场",
  },
  {
    key: "progress",
    label: "求职进度",
    title: "求职进度",
    description: "追踪求职全流程进度，每一步都清晰可见。",
    metric: "76",
    unit: "%",
  },
];

function isBlockedStitchRoute(pathname) {
  const blockedStitchPath = `/${["stitch", "screens"].join("-")}/`;
  const blockedScreenToken = ["DATA", "SCREEN"].join(":");
  return pathname.startsWith(blockedStitchPath) || pathname.includes(blockedScreenToken);
}

function routeKeyFromPath(path) {
  return appRoutes.find((item) => item.path === path)?.key ?? "dashboard";
}

function routeFromLocation() {
  const pathname = normalizePath(decodeURIComponent(window.location.pathname));
  const hash = window.location.hash.replace(/^#\/?/, "");

  if (pathname === "/" && hash.startsWith("workspace/")) {
    const legacyKey = hash.split("/")[1];
    const mapped = legacyRouteMap[`/workspace/${legacyKey}`] ?? "/dashboard";
    return { view: "app", page: routeKeyFromPath(mapped), redirectTo: mapped };
  }

  if (isBlockedStitchRoute(pathname)) {
    return { view: "landing", page: "home", redirectTo: "/" };
  }

  if (pathname === "/") {
    return { view: "landing", page: "home" };
  }

  if (legacyRouteMap[pathname]) {
    const redirectTo = legacyRouteMap[pathname];
    return { view: "app", page: routeKeyFromPath(redirectTo), redirectTo };
  }

  if (/^\/campus\/[^/]+\/edit$/.test(pathname)) {
    return { view: "app", page: "campus-edit" };
  }

  if (/^\/internships\/[^/]+\/edit$/.test(pathname)) {
    return { view: "app", page: "internship-edit" };
  }

  if (/^\/community\/post\/[^/]+$/.test(pathname)) {
    return { view: "app", page: "community-post" };
  }

  const route = appRoutes.find((item) => item.path === pathname);
  if (route) {
    return { view: "app", page: route.key };
  }

  return { view: "app", page: "not-found" };
}

/** 返回当前浏览器地址，包含查询参数和 hash，便于登录后恢复原目标页。 */
function currentLocationPath() {
  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
}

/** 规范化当前路由状态，避免每次路由同步重复拼装 locationKey。 */
function routeState(nextRoute) {
  return {
    view: nextRoute.view,
    page: nextRoute.page,
    locationKey: currentLocationPath(),
  };
}

function App() {
  const [currentUser, setCurrentUser] = useState(null);
  const currentUserRef = useRef(null);
  const pendingPathRef = useRef(null);
  const [route, setRoute] = useState({ view: "landing", page: "home", locationKey: "/" });
  const [authReady, setAuthReady] = useState(false);
  const [themeMode, setThemeMode] = useState(() => window.localStorage.getItem("gqld-theme-mode") || "dark");
  const [loginOpen, setLoginOpen] = useState(false);
  const [loginAttemptKey, setLoginAttemptKey] = useState(0);
  const accountSwitchInProgressRef = useRef(false);

  function updateAuthUser(nextUser) {
    currentUserRef.current = nextUser;
    setCurrentUser(nextUser);
  }

  useEffect(() => {
    let cancelled = false;

    getWechatCurrentSession()
      .catch(() => ({ authenticated: false }))
      .then(async (session) => {
        if (session?.authenticated || !LOCAL_AUTH_BYPASS_ENABLED) return session;
        try {
          return await createLocalDevSession();
        } catch (error) {
          console.warn("本地开发登录未启用，继续使用正常登录流程。", error);
          return session;
        }
      })
      .then((session) => {
        if (cancelled) return;

        const user = session?.authenticated ? session : null;
        updateAuthUser(user);

        let nextRoute = routeFromLocation();
        if (nextRoute.redirectTo) {
          window.history.replaceState({}, "", nextRoute.redirectTo);
          nextRoute = routeFromLocation();
        }

        // TODO(临时): 注释掉强制扫码登录，未登录用户也可直接进入业务页面
        // if (nextRoute.view !== "landing" && !user) {
        //   pendingPathRef.current = currentLocationPath();
        //   window.history.replaceState({}, "", "/");
        //   setRoute({ view: "landing", page: "home", locationKey: "/" });
        //   setLoginOpen(true);
        // } else {
        // setRoute(routeState(nextRoute));
        // }
        setAuthReady(true);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!authReady) return undefined;

    const syncRoute = () => {
      let nextRoute = routeFromLocation();
      if (nextRoute.redirectTo) {
        window.history.replaceState({}, "", nextRoute.redirectTo);
        nextRoute = routeFromLocation();
      }

      // TODO(临时): 注释掉强制扫码登录，未登录用户也可直接进入业务页面
      //  if (nextRoute.view !== "landing" && !currentUserRef.current) {
      //    pendingPathRef.current = currentLocationPath();
      //    window.history.replaceState({}, "", "/");
      //    setRoute({ view: "landing", page: "home", locationKey: "/" });
      //    setLoginOpen(true);
      //    return;
      //  }
      //
      setRoute(routeState(nextRoute));
    };

    syncRoute();
    window.addEventListener("popstate", syncRoute);
    window.addEventListener("hashchange", syncRoute);
    return () => {
      window.removeEventListener("popstate", syncRoute);
      window.removeEventListener("hashchange", syncRoute);
    };
  }, [authReady, currentUser]);

  useEffect(() => {
    const normalizedTheme = themeMode === "light" ? "light" : "dark";
    document.body.classList.toggle("theme-light", normalizedTheme === "light");
    document.body.classList.toggle("theme-dark", normalizedTheme === "dark");
    window.localStorage.setItem("gqld-theme-mode", normalizedTheme);
  }, [themeMode]);

  function commitNavigation(path, replace = false) {
    const targetUrl = new URL(path || "/", window.location.origin);
    const target = `${targetUrl.pathname}${targetUrl.search}${targetUrl.hash}`;
    if (currentLocationPath() !== target) {
      window.history[replace ? "replaceState" : "pushState"]({}, "", target);
    }
    window.dispatchEvent(new PopStateEvent("popstate"));
  }

  function navigate(path) {
    const target = path || "/";
    // TODO(临时): 注释掉强制扫码登录，未登录用户也可直接访问业务页面
    //  if (!currentUserRef.current && requiresLoginForPath(target)) {
    //    pendingPathRef.current = target;
    //    setLoginOpen(true);
    //    return;
    //  }
    commitNavigation(target);
  }

  /** 打开登录弹层；切换账号时先确认后端已注销，再清理前端身份。 */
  async function openLogin() {
    if (accountSwitchInProgressRef.current) return;
    accountSwitchInProgressRef.current = true;

    try {
      if (currentUserRef.current) {
        const currentPath = currentLocationPath();
        try {
          await logoutWechatSession();
        } catch (error) {
          console.error("注销当前账号失败，已保留原登录状态。", error);
          return;
        }

        if (requiresLoginForPath(currentPath)) {
          pendingPathRef.current = currentPath;
          commitNavigation("/", true);
        } else {
          pendingPathRef.current = null;
        }
        updateAuthUser(null);
        clearAuthToken();
      } else {
        pendingPathRef.current = null;
      }
      setLoginAttemptKey((value) => value + 1);
      setLoginOpen(true);
    } finally {
      accountSwitchInProgressRef.current = false;
    }
  }

  /** 接收二维码轮询得到的 SUCCESS，解析真实用户并恢复用户原本要访问的页面。 */
  const handleLoginSuccess = useCallback(async (payload) => {
    const user = payload?.authenticated
      ? payload
      : (payload?.status === "SUCCESS"
          ? await getWechatCurrentSession().catch(() => null)
          : null);
    if (!user?.authenticated) return;

    setAuthToken(payload?.token || null);
    updateAuthUser(user);
    setLoginOpen(false);
    const destination = pendingPathRef.current;
    pendingPathRef.current = null;
    if (destination && requiresLoginForPath(destination)) {
      commitNavigation(destination);
    }
  }, []);

  function closeLogin() {
    pendingPathRef.current = null;
    setLoginOpen(false);
  }

  if (!authReady) {
    return (
      <div className="app-auth-loading" role="status" aria-label="正在验证登录状态">
        <span aria-hidden="true" />
      </div>
    );
  }

  return (
    <>
      {route.view === "landing"
        ? <LandingPage navigate={navigate} onLogin={openLogin} isAuthenticated={Boolean(currentUser)} />
        : <AppLayout activePage={route.page} navigate={navigate} routeKey={route.locationKey} onLogin={openLogin} isAuthenticated={Boolean(currentUser)} />}
      {loginOpen && (
        <WechatLoginModal
          key={loginAttemptKey}
          onClose={closeLogin}
          onSuccess={handleLoginSuccess}
        />
      )}
    </>
  );
}

function BrandMark({ onClick, compact = false }) {
  const content = (
    <>
      <img src={brandUrl} alt="律动求职" />
      <span className="brand-copy">
        <strong>律动求职</strong>
        {!compact && <small>简历优化、面试辅导、求职陪跑一站式服务平台</small>}
      </span>
    </>
  );

  if (!onClick) {
    return <div className="brand-mark">{content}</div>;
  }

  return (
    <button className="brand-mark" type="button" onClick={onClick} aria-label="返回首页">
      {content}
    </button>
  );
}

const siteFooterSections = [
  {
    title: "求职工具",
    links: [
      { label: "AI简历", path: "/dashboard" },
      { label: "校招岗位", path: "/campus" },
      { label: "实习岗位", path: "/internship" },
      { label: "社招岗位", path: "/social-recruitment" },
    ],
  },
  {
    title: "内容资源",
    links: [
      { label: "求职攻略", path: "/community" },
      { label: "定制化服务", path: "/custom-service" },
      { label: "导师阵容", path: "/custom-service" },
      { label: "学员案例", path: "/custom-service" },
    ],
  },
  {
    title: "公司与规则",
    links: [
      { label: "关于我们", path: "/custom-service" },
      { label: "用户协议", path: "/custom-service" },
      { label: "隐私政策", path: "/custom-service" },
      { label: "联系我们", path: "/custom-service" },
    ],
  },
];

function SiteFooter({ navigate }) {
  return (
    <footer className="site-footer" aria-label="网站底部信息">
      <div className="site-footer-top">
        <div className="site-footer-brand">
          <BrandMark compact />
          <p>简历优化、面试辅导、求职陪跑一站式服务平台</p>
        </div>
        <div className="site-footer-links">
          {siteFooterSections.map((section) => (
            <section key={section.title} className="site-footer-column">
              <h3>{section.title}</h3>
              <ul>
                {section.links.map((item) => (
                  <li key={item.label}>
                    <button type="button" onClick={() => navigate(item.path)}>{item.label}</button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </div>
      <div className="site-footer-bottom">
        <span>? 2026 律动求职</span>
        <span className="site-footer-divider">|</span>
        <span>人力资源服务许可证:0104003713号</span>
        <span className="site-footer-divider">|</span>
        <a href="https://beian.miit.gov.cn/" target="_blank" rel="noreferrer">工信部备案号：蜀ICP备2026027387号-3</a>
        <span className="site-footer-divider">|</span>
        <a href="https://beian.mps.gov.cn/#/query/webSearch?code=51019002010149" target="_blank" rel="noreferrer">公安备案号：川公网安备51019002010149号</a>
      </div>
    </footer>
  );
}

function LandingPage({ navigate, onLogin, isAuthenticated }) {
  const [activeStep, setActiveStep] = useState(heroSteps[0].key);
  const activeIndex = Math.max(0, heroSteps.findIndex((step) => step.key === activeStep));

  function setActiveIndex(index) {
    const nextIndex = (index + heroSteps.length) % heroSteps.length;
    setActiveStep(heroSteps[nextIndex].key);
  }

  return (
    <div className="landing-page">
      <LandingHeader navigate={navigate} onLogin={onLogin} isAuthenticated={isAuthenticated} />
      <main>
        <section className="landing-hero" aria-label="AI 校园求职平台首页">
          <div className="hero-copy">
            <span className="hero-kicker">
              <i aria-hidden="true">?</i>
              <b>AI 智能引擎 · 覆盖校招与社招</b>
            </span>
            <h1>
              <span>掌握核心方法论</span>
              <span className="hero-title-accent">让好 Offer 水到渠成</span>
            </h1>
            <p>融合 AI 深度洞察与名企导师智慧，为您提供“职业规划-简历精修-面试辅导-斩获 Offer”的一站式通关方案。我们助您拿下的不仅是一份心仪的工作，更是受用终身的职场核心竞争力。</p>
            <button className="primary-cta" type="button" onClick={() => navigate("/dashboard")}>
              <span>开始你的求职之旅</span>
              <i aria-hidden="true">→</i>
            </button>
          </div>
          <FeatureShowcase activeIndex={activeIndex} setActiveIndex={setActiveIndex} />
        </section>

        <section className="landing-value" aria-label="核心价值">
          <div className="value-lead">
            <h2>从准备、投递到面试，每一步都能被看见。</h2>
            <p>平台保留真实求职流程的复杂度，但把信息组织成适合学生反复使用的工作区。</p>
          </div>
          <div className="value-grid">
            <article>
              <span>01</span>
              <h3>智能简历诊断</h3>
              <p>深度解析经历、精准定位短板，为你提供可执行的优化建议，生成高匹配度的专业简历。</p>
            </article>
            <article>
              <span>02</span>
              <h3>精准岗位匹配</h3>
              <p>全量覆盖校招、社招与实习机会。依托算法按求职阶段与个人能力，双向筛选最优解。</p>
            </article>
            <article>
              <span>03</span>
              <h3>专家求职陪跑</h3>
              <p>告别单打独斗。从职业定位、简历打磨到全真模拟面试，资深行业导师提供 1v1 针对性辅导。</p>
            </article>
            <article>
              <span>04</span>
              <h3>深度求职攻略</h3>
              <p>沉淀科学的投递节奏、面经与实战方法论。打破信息壁垒，助你掌握终身受用的职场规则。</p>
            </article>
          </div>
        </section>
        <SiteFooter navigate={navigate} />
      </main>
    </div>
  );
}

function LandingHeader({ navigate, onLogin, isAuthenticated }) {
  return (
    <header className="landing-header">
      <BrandMark onClick={() => navigate("/")} />
      <nav aria-label="首页导航">
        {topNavItems.slice(1).map((item) => (
          <button key={item.key} type="button" onClick={() => navigate(item.path)}>
            {item.label}
          </button>
        ))}
      </nav>
      <div className="landing-header-actions">
        <button className="landing-login-button" type="button" onClick={onLogin}>
          {isAuthenticated ? "切换账号" : "登录"}
        </button>
        <button className="glass-button" type="button" onClick={() => navigate("/dashboard")}>
          进入工作台
        </button>
      </div>
    </header>
  );
}

function FeatureShowcase({ activeIndex, setActiveIndex }) {
  const stageRef = useRef(null);
  const dragRef = useRef({ startX: 0, lastX: 0, dragging: false });
  const rafRef = useRef(0);
  const animationRef = useRef(0);
  const [isDragging, setIsDragging] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);

  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (animationRef.current) window.clearTimeout(animationRef.current);
    };
  }, []);

  function setStageVars(vars) {
    const stage = stageRef.current;
    if (!stage) return;
    Object.entries(vars).forEach(([key, value]) => stage.style.setProperty(key, value));
  }

  function handlePointerMove(event) {
    const stage = stageRef.current;
    if (!stage) return;

    const rect = stage.getBoundingClientRect();
    const offsetX = (event.clientX - rect.left) / rect.width - 0.5;
    const offsetY = (event.clientY - rect.top) / rect.height - 0.5;

    if (dragRef.current.dragging) {
      dragRef.current.lastX = event.clientX;
      const delta = event.clientX - dragRef.current.startX;
      const nextDrag = Math.max(-92, Math.min(92, delta));
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        const arcLift = Math.min(28, Math.abs(nextDrag) * 0.22);
        setStageVars({
          "--drag-x": `${nextDrag}px`,
          "--drag-y": `${arcLift}px`,
          "--drag-rotate": `${nextDrag * -0.16}deg`,
          "--tilt-y": `${offsetX * 9}deg`,
          "--tilt-x": `${offsetY * -7}deg`,
          "--light-x": `${event.clientX - rect.left}px`,
          "--light-y": `${event.clientY - rect.top}px`,
        });
      });
      return;
    }

    setStageVars({
      "--tilt-y": `${offsetX * 7}deg`,
      "--tilt-x": `${offsetY * -5}deg`,
      "--drag-rotate": "0deg",
      "--light-x": `${event.clientX - rect.left}px`,
      "--light-y": `${event.clientY - rect.top}px`,
    });
  }

  function finishDrag() {
    const delta = dragRef.current.lastX - dragRef.current.startX;
    dragRef.current.dragging = false;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = 0;
    setIsDragging(false);
    setStageVars({ "--drag-x": "0px", "--drag-y": "0px", "--drag-rotate": "0deg", "--tilt-y": "0deg", "--tilt-x": "0deg" });
    if (Math.abs(delta) >= 52) requestActiveIndex(activeIndex + (delta < 0 ? 1 : -1));
  }

  function requestActiveIndex(index) {
    const nextIndex = (index + heroSteps.length) % heroSteps.length;
    if (nextIndex === activeIndex) return;
    if (animationRef.current) window.clearTimeout(animationRef.current);
    setIsAnimating(true);
    setActiveIndex(nextIndex);
    animationRef.current = window.setTimeout(() => setIsAnimating(false), 720);
  }

  function handlePointerDown(event) {
    dragRef.current = { startX: event.clientX, lastX: event.clientX, dragging: true };
    setIsDragging(true);
    setStageVars({ "--drag-x": "0px", "--drag-y": "0px", "--drag-rotate": "0deg" });
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  function getWrappedOffset(index) {
    const rawOffset = index - activeIndex;
    if (rawOffset > heroSteps.length / 2) return rawOffset - heroSteps.length;
    if (rawOffset < -heroSteps.length / 2) return rawOffset + heroSteps.length;
    return rawOffset;
  }

  function getCardClass(index) {
    const offset = getWrappedOffset(index);
    if (offset === 0) return "active";
    if (offset === -1) return "previous";
    if (offset === 1) return "next";
    return offset < 0 ? "back back-prev" : "back back-next";
  }

  const activeStep = heroSteps[activeIndex];

  return (
    <div className="showcase-shell">
      <div
        ref={stageRef}
        className={`feature-stage ${isDragging ? "dragging" : ""} ${isAnimating ? "animating" : ""}`}
        style={{ "--drag-x": "0px", "--drag-y": "0px", "--drag-rotate": "0deg", "--tilt-x": "0deg", "--tilt-y": "0deg", "--light-x": "50%", "--light-y": "30%" }}
        role="region"
        tabIndex={0}
        aria-label="3D 功能卡片展示，可左右拖拽切换"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={finishDrag}
        onPointerCancel={finishDrag}
        onPointerLeave={() => !dragRef.current.dragging && setStageVars({ "--tilt-y": "0deg", "--tilt-x": "0deg", "--drag-x": "0px", "--drag-y": "0px", "--drag-rotate": "0deg" })}
        onKeyDown={(event) => {
          if (event.key === "ArrowRight") requestActiveIndex(activeIndex + 1);
          if (event.key === "ArrowLeft") requestActiveIndex(activeIndex - 1);
        }}
      >
        {heroSteps.map((step, index) => (
          <article
            key={step.key}
            className={`feature-card ${getCardClass(index)}`}
            onClick={() => {
              const offset = getWrappedOffset(index);
              if (offset === -1 || offset === 1) requestActiveIndex(activeIndex + offset);
            }}
            aria-hidden={index !== activeIndex}
          >
            <div className="card-topline">
              <span>{String(index + 1).padStart(2, "0")}</span>
              <b>{step.label}</b>
            </div>
            <h2>{step.title}</h2>
            <p>{step.description}</p>
            <div className="card-metric">
              <strong>{step.metric}</strong>
              <span>{step.unit}</span>
            </div>
          </article>
        ))}
      </div>

      <div className="showcase-controls" aria-label="功能切换">
        <div className="showcase-readout">
          <strong>{String(activeIndex + 1).padStart(2, "0")}</strong>
          <span>/ 04</span>
          <em>{activeStep.title}</em>
        </div>
        <div className="showcase-progress" aria-hidden="true">
          <span style={{ width: `${((activeIndex + 1) / heroSteps.length) * 100}%` }} />
        </div>
        <div className="step-controls" role="tablist" aria-label="选择首页展示功能">
          {heroSteps.map((step, index) => (
            <button
              key={step.key}
              type="button"
              role="tab"
              aria-selected={index === activeIndex}
              className={index === activeIndex ? "active" : ""}
              onClick={() => requestActiveIndex(index)}
            >
              {step.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function AppLayout({ activePage, navigate, routeKey, onLogin, isAuthenticated }) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  function go(path) {
    setMobileMenuOpen(false);
    navigate(path);
  }

  return (
    <div className="app-shell">
      <AppTopNav
        activePage={activePage}
        navigate={go}
        mobileMenuOpen={mobileMenuOpen}
        setMobileMenuOpen={setMobileMenuOpen}
        onLogin={onLogin}
        isAuthenticated={isAuthenticated}
      />
      <main className="app-main">
        <AppPage activePage={activePage} navigate={navigate} routeKey={routeKey} />
      </main>
    </div>
  );
}

function AppTopNav({ activePage, navigate, mobileMenuOpen, setMobileMenuOpen, onLogin, isAuthenticated }) {
  const activeNavKey = activePage.startsWith("campus")
    ? "campus"
    : activePage.startsWith("internship")
      ? "internship"
      : activePage.startsWith("community")
        ? "community"
        : activePage;

  return (
    <header className="app-topbar">
      <BrandMark onClick={() => navigate("/")} />
      <nav className="top-nav" aria-label="顶部导航">
        {topNavItems.map((item) => (
          <button
            key={item.key}
            type="button"
            className={`nav-item ${(item.key === activeNavKey || (item.key === "home" && activeNavKey === "home")) ? "is-active" : ""}`}
            onClick={() => navigate(item.path)}
          >
            {item.label}
          </button>
        ))}
      </nav>
      <div className="topbar-actions">
        <button
          className={`profile-entry-button ${activePage === "profile" ? "is-active" : ""}`}
          type="button"
          onClick={() => navigate("/profile")}
          aria-current={activePage === "profile" ? "page" : undefined}
        >
          个人中心
        </button>
        <button className="profile-chip" type="button" onClick={onLogin}>
          {isAuthenticated ? "切换账号" : "登录"}
        </button>
        <button
          className={`menu-button ${mobileMenuOpen ? "open" : ""}`}
          type="button"
          aria-label="打开导航菜单"
          aria-expanded={mobileMenuOpen}
          onClick={() => setMobileMenuOpen((open) => !open)}
        >
          <span />
          <span />
        </button>
      </div>
      {mobileMenuOpen && (
        <nav className="mobile-nav" aria-label="移动端导航">
          {topNavItems.map((item) => (
            <button
              key={item.key}
              type="button"
              className={`nav-item ${(item.key === activeNavKey || (item.key === "home" && activeNavKey === "home")) ? "is-active" : ""}`}
              onClick={() => navigate(item.path)}
            >
              {item.label}
            </button>
          ))}
          <button
            className="nav-item mobile-account-action"
            type="button"
            onClick={() => {
              setMobileMenuOpen(false);
              onLogin();
            }}
          >
            {isAuthenticated ? "切换账号" : "登录"}
          </button>
        </nav>
      )}
    </header>
  );
}

function AppPage({ activePage, navigate, routeKey }) {
  const pages = {
    dashboard: <DashboardPage navigate={navigate} routeKey={routeKey} />,
    resume: <ResumePage />,
    "question-bank": <QuestionBankPage navigate={navigate} />,
    campus: <CampusPage navigate={navigate} />,
    "recruitment-admin": <RecruitmentAdminPage navigate={navigate} />,
    "campus-new": <JobEntryPage jobType="campus" navigate={navigate} />,
    "campus-edit": <JobEntryPage jobType="campus" navigate={navigate} mode="edit" />,
    internship: <InternshipPage navigate={navigate} />,
    "internship-new": <JobEntryPage jobType="internship" navigate={navigate} />,
    "internship-edit": <JobEntryPage jobType="internship" navigate={navigate} mode="edit" />,
    "social-recruitment": <SocialRecruitmentPage />,
    "custom-service": <CustomServicePage navigate={navigate} />,
    community: <CommunityPage navigate={navigate} />,
    "community-post": <CommunityPage navigate={navigate} detailMode />,
    profile: <ProfilePage />,
    "not-found": <NotFoundPage navigate={navigate} />,
  };
  return pages[activePage] ?? pages["not-found"];
}

const AI_RESUME_DRAFT_KEY = "guangqi-ai-resume-draft";
const TYPEWRITER_DELAY_MS = 18;
const TYPEWRITER_FAST_DELAY_MS = 10;
const TYPEWRITER_LONG_REPLY_THRESHOLD = 220;
const aiResumeModes = [
  {
    key: "generate",
    title: "简历生成",
    description: "根据个人经历生成专业简历",
    glyph: "GEN",
    prompt: "我们先从求职方向开始。请告诉我你的目标岗位、教育背景、项目经历、实习经历、技能和个人优势，我会帮你整理成简历结构。",
    placeholder: "告诉我你的求职方向和个人经历……",
  },
  {
    key: "diagnose",
    title: "简历诊断",
    description: "分析现有简历的问题和提升空间",
    glyph: "DX",
    prompt: "请上传 PDF、DOC 或 DOCX 简历。我会先检查结构、表达、项目证据和岗位匹配度，你也可以补充希望重点诊断的问题。",
    placeholder: "上传简历，或告诉我你希望重点诊断的问题……",
  },
  {
    key: "optimize",
    title: "简历优化",
    description: "结合目标岗位和JD优化内容",
    glyph: "OPT",
    prompt: "请粘贴目标岗位 JD，并选择已有简历或上传新简历。我会围绕岗位关键词、项目证据和成果表达给出优化方向。",
    placeholder: "粘贴目标岗位JD，告诉我需要优化的简历……",
  },
  {
    key: "question-bank",
    title: "AI面试",
    description: "整理求职笔试与面试题目",
    glyph: "QB",
  },
];

const RESUME_WIZARD_INTRO = "我会按常用简历模块逐步提问。你在左侧回答，右侧简历会同步生成；已有内容也可以继续补充。";
const RESUME_WIZARD_DONE = "基础简历已经搭好了。你可以继续在输入框补充任意经历，我会继续写入右侧预览；也可以保存草稿后再慢慢调整。";
const resumeWizardSteps = [
  {
    key: "basicInfo",
    label: "个人信息",
    question: "先告诉我你的姓名、手机号、邮箱和所在城市，我会先把简历头部搭起来。",
    placeholder: "例如：张三，13800000000，example@email.com，北京",
  },
  {
    key: "jobTarget",
    label: "求职方向",
    question: "你希望申请什么岗位？如果有目标行业、目标公司或求职城市，也可以一起告诉我。",
    placeholder: "例如：校招产品经理，偏数据分析方向，期望北京/深圳",
  },
  {
    key: "education",
    label: "教育经历",
    question: "请补充教育经历：学校、专业、学历、时间、GPA/排名、相关课程或荣誉都可以写。",
    placeholder: "例如：示例大学，本科，计算机科学，2022.09-2026.06，GPA 3.8/4.0",
  },
  {
    key: "experience",
    label: "实习/工作经历",
    question: "写一段最重要的实习或工作经历，包含公司/组织、岗位、时间、负责事项和结果。",
    placeholder: "例如：某互联网公司产品实习生，负责用户调研和数据看板，推动转化率提升 12%",
  },
  {
    key: "projects",
    label: "项目经历",
    question: "请补充 1-3 个项目经历，尽量写清项目目标、你的角色、使用的方法/工具和量化成果。",
    placeholder: "例如：校园招聘数据分析项目，使用 Python/SQL/Tableau 分析岗位趋势",
  },
  {
    key: "skills",
    label: "专业技能",
    question: "把你的技能整理一下：专业技能、专业工具、证书、语言能力、办公/设计/数据分析能力都可以。",
    placeholder: "例如：数据分析、活动策划、Excel、Tableau、Figma；英语 CET-6",
  },
  {
    key: "campusExperience",
    label: "校园经历",
    question: "有没有校园经历、社团经历、竞赛、奖项、志愿服务或学生工作？可以挑最有代表性的写。",
    placeholder: "例如：学生会宣传部部长，组织校园活动 3 场，覆盖 800+ 同学",
  },
  {
    key: "summary",
    label: "自我评价",
    question: "最后补一段自我评价，突出你的优势、做事风格和与目标岗位相关的亮点。",
    placeholder: "例如：数据敏感、沟通协作强，能把复杂问题拆解成可执行方案",
  },
];

const defaultAssistantMessages = {
  chat: [
    {
      id: "welcome",
      role: "assistant",
      text: "你好，我是小律。你可以让我帮你生成简历、诊断现有简历，或者根据目标岗位优化简历。",
    },
  ],
  generate: [],
  diagnose: [
    {
      id: "diagnose_welcome",
      role: "assistant",
      text: "这里是简历诊断助手。你可以上传简历，或直接描述你担心的问题，我会围绕结构、表达、项目证据和岗位匹配度给出建议。",
    },
  ],
  optimize: [
    {
      id: "optimize_welcome",
      role: "assistant",
      text: "这里是简历优化助手。请粘贴目标岗位 JD，或告诉我目标岗位和已有经历，我会帮你把内容改得更贴近岗位要求。",
    },
  ],
};

function createLocalOptimizationPlan({ resume, jd, context, apiError }) {
  const isDiagnosisContext = Boolean(context?.diagnosisId || context?.sourceLabel === "简历诊断报告");
  const targetRole = isDiagnosisContext
    ? "诊断报告问题优化"
    : (context?.role && context.role !== "按问题优先级优化")
      ? context.role
      : jd.split(/\n|，|,|。/).map((item) => item.trim()).find(Boolean) || "目标岗位";
  const targetCompany = !isDiagnosisContext && context?.company && context.company !== "诊断报告" ? context.company : "";
  const keywordPool = [
    "产品", "用户", "增长", "数据", "需求", "竞品", "协作", "项目", "运营", "分析",
    "前端", "后端", "算法", "测试", "SQL", "Python", "Java", "AIGC",
  ];
  const keywords = keywordPool.filter((keyword) => jd.toLowerCase().includes(keyword.toLowerCase())).slice(0, 8);
  const finalKeywords = keywords.length ? keywords : ["岗位关键词", "项目成果", "量化指标", "协作能力"];

  return {
    id: `local-optimization-${Date.now()}`,
    source: "local",
    title: `${targetRole} 简历优化方案`,
    subtitle: apiError
      ? `AI接口暂未返回可用结果，已先生成本地预览方案：${apiError}`
      : "当前为本地预览方案，后端接口接通后会替换为真实AI优化建议。",
    targetRole,
    targetCompany,
    resumeName: resume?.fileName ?? context?.resumeName ?? "当前简历",
    keywords: finalKeywords,
    summaryPoints: [
      "先把求职方向和目标岗位放到简历顶部，减少HR初筛时的判断成本。",
      "把项目/实习描述从“负责什么”改成“用什么方法，解决什么问题，产生什么结果”。",
      "补充与目标岗位相关的关键词，但不要堆词，必须落到项目、经历或技能证据上。",
    ],
    summary: [
      "先把求职方向和目标岗位放到简历顶部，减少HR初筛时的判断成本。",
      "把项目/实习描述从“负责什么”改成“用什么方法，解决什么问题，产生什么结果”。",
      "补充与目标岗位相关的关键词，但不要堆词，必须落到项目、经历或技能证据上。",
    ],
    warnings: ["当前为本地预览方案，不会自动覆盖原简历。", "所有数字和成果必须由你确认后再写入。"],
    modelShared: false,
    generatedAt: new Date().toISOString(),
    disclaimer: "本地预览建议仅用于占位，真实优化应以后端大模型结果为准。",
    tasks: [
      {
        id: "target",
        section: "求职目标",
        priority: "立即修改",
        before: "简历顶部没有明确展示目标岗位，岗位方向容易显得分散。",
        after: `在姓名下方增加目标岗位：${targetCompany ? `${targetCompany} · ` : ""}${targetRole}，并补充目标城市/岗位类型。`,
        reason: "目标岗位会影响关键词布局、项目排序和个人总结写法。",
        evidence: "未识别",
        actionType: "add",
        acceptanceCriteria: "简历头部能一眼看到目标岗位和投递方向。",
      },
      {
        id: "project",
        section: "项目经历",
        priority: "建议优化",
        before: "项目描述如果只写职责，会弱化个人贡献。",
        after: `按“背景-行动-工具-结果”重写项目经历，突出与${targetRole}相关的分析、协作和交付成果。`,
        reason: "项目证据是校招/实习简历里最能证明能力的部分。",
        evidence: "未识别",
        actionType: "rewrite",
        acceptanceCriteria: "每段项目至少包含角色、动作、工具或方法、结果。",
      },
      {
        id: "achievement",
        section: "成果表达",
        priority: "建议优化",
        before: "缺少数据规模、提升比例、覆盖人数、交付周期等量化证据。",
        after: "为每段核心经历补充至少1个可核实数据，例如用户量、转化率、效率提升、活动覆盖人数或项目周期。",
        reason: "量化结果能让经历更可信，但数字必须由用户确认，不能虚构。",
        evidence: "未识别",
        actionType: "clarify",
        acceptanceCriteria: "所有新增数字都能被你解释来源。",
      },
      {
        id: "keywords",
        section: "岗位关键词",
        priority: "可选提升",
        before: "技能和经历中的岗位关键词不够集中。",
        after: `围绕 ${finalKeywords.join("、")} 调整技能顺序，并把关键词嵌入真实经历。`,
        reason: "关键词应服务于岗位匹配，不能脱离经历单独堆砌。",
        evidence: "未识别",
        actionType: "reorder",
        acceptanceCriteria: "关键词能在技能和经历证据中同时出现。",
      },
    ],
  };
}

function normalizeOptimizationPlan(rawResult, fallback) {
  const result = rawResult?.data ?? rawResult?.result ?? rawResult;
  if (!result || typeof result !== "object") throw new Error("AI优化接口未返回有效结果。");

  const rawItems = result.tasks ?? result.recommendations ?? result.suggestions ?? result.advice ?? [];
  const tasks = Array.isArray(rawItems)
    ? rawItems.map((item, index) => ({
      id: item.id ?? `remote-task-${index}`,
      section: item.section ?? item.sectionType ?? item.title ?? `优化项 ${index + 1}`,
      priority: item.priority ?? item.level ?? "建议优化",
      before: item.before ?? item.original ?? item.problem ?? item.current ?? "后端未返回原文片段。",
      after: item.after ?? item.suggestion ?? item.rewrite ?? item.optimized ?? item.advice ?? "后端未返回改写建议。",
      reason: item.reason ?? item.explanation ?? item.why ?? "建议结合目标岗位确认后再采纳。",
      evidence: item.evidence ?? item.evidenceSnippet ?? item.quote ?? "未识别",
      actionType: item.actionType ?? item.action ?? "rewrite",
      acceptanceCriteria: item.acceptanceCriteria ?? item.doneWhen ?? "用户确认内容真实后再手动修改。",
    }))
    : [];

  if (tasks.length === 0) throw new Error("AI优化接口未返回可用优化建议。");

  return {
    id: result.id ?? result.optimizationId ?? `remote-optimization-${Date.now()}`,
    source: "remote",
    title: result.title ?? `${fallback.context?.role ?? "目标岗位"} 简历优化方案`,
    subtitle: result.summary ?? "已根据后端AI接口返回结果生成优化方案。",
    targetRole: result.targetRole ?? fallback.context?.role ?? fallback.jd ?? "目标岗位",
    targetCompany: result.company ?? fallback.context?.company ?? "",
    resumeName: result.resumeName ?? fallback.resume?.fileName ?? fallback.context?.resumeName ?? "当前简历",
    keywords: result.keywords ?? result.keywordCoverage ?? [],
    summary: Array.isArray(result.summaryPoints) ? result.summaryPoints : [result.summary ?? "已生成优化建议，请逐项确认后采纳。"],
    summaryPoints: Array.isArray(result.summaryPoints) ? result.summaryPoints : [],
    warnings: Array.isArray(result.warnings) ? result.warnings : ["不会自动覆盖原简历", "数字和成果需要用户确认"],
    modelShared: result.modelShared !== false,
    modelSource: result.source ?? "openai-compatible-shared-model",
    generatedAt: result.createdAt ?? new Date().toISOString(),
    disclaimer: result.disclaimer ?? "AI辅助优化建议需要用户确认，不代表录用概率。",
    tasks,
  };
}

function cleanResumeAnswer(answer) {
  return answer.replace(/\s+\n/g, "\n").trim();
}

function mergeResumeAnswer(existing, answer) {
  const next = cleanResumeAnswer(answer);
  if (!next) return existing ?? "";
  if (!existing) return next;
  if (existing.includes(next)) return existing;
  return `${existing}\n${next}`;
}

function isResumeWizardStepFilled(resumeData, step) {
  if (step.key === "basicInfo") {
    const basic = resumeData.basicInfo ?? {};
    return Boolean(basic.name && basic.phone && basic.email && basic.location);
  }
  return Boolean(String(resumeData[step.key] ?? "").trim());
}

function getNextResumeWizardStepIndex(resumeData, startIndex = 0) {
  const nextIndex = resumeWizardSteps.findIndex((step, index) => (
    index >= startIndex && !isResumeWizardStepFilled(resumeData, step)
  ));
  return nextIndex === -1 ? resumeWizardSteps.length : nextIndex;
}

function countCompletedResumeWizardSteps(resumeData) {
  return resumeWizardSteps.filter((step) => isResumeWizardStepFilled(resumeData, step)).length;
}

function applyResumeWizardAnswer(previousData, step, answer) {
  const cleanAnswer = cleanResumeAnswer(answer);
  if (!step || !cleanAnswer) return previousData;

  if (step.key === "basicInfo") {
    return applyBasicInfoAnswer(previousData, cleanAnswer);
  }

  if (step.key === "jobTarget") {
    return {
      ...inferResumeDataFromText(previousData, cleanAnswer),
      jobTarget: cleanAnswer,
    };
  }

  return {
    ...previousData,
    [step.key]: mergeResumeAnswer(previousData[step.key], cleanAnswer),
  };
}

function applyBasicInfoAnswer(previousData, answer) {
  const next = {
    ...previousData,
    basicInfo: {
      ...(previousData.basicInfo ?? {}),
    },
  };
  const phone = answer.match(/1[3-9]\d{9}/)?.[0];
  const email = answer.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/)?.[0];
  const explicitName = answer.match(/(?:姓名|我叫|名字)[：:\s是为]*([\u4e00-\u9fa5A-Za-z·]{2,16})/)?.[1];
  const explicitLocation = answer.match(/(?:城市|所在地|现居|目前在|求职城市|意向城市)[：:\s是为]*([\u4e00-\u9fa5]{2,12})/)?.[1];
  const knownCities = "北京|上海|广州|深圳|杭州|南京|成都|武汉|西安|苏州|天津|重庆|长沙|郑州|青岛|厦门|合肥|宁波|无锡|佛山|东莞|珠海|大连|沈阳|济南|福州|昆明|南昌|贵阳|南宁|哈尔滨|长春|太原|石家庄|兰州|海口";
  const city = explicitLocation ?? answer.match(new RegExp(`(${knownCities})(?:市)?`))?.[1];
  const withoutContacts = answer
    .replace(phone ?? "", "")
    .replace(email ?? "", "")
    .replace(explicitLocation ?? "", "")
    .replace(new RegExp(`(${knownCities})(?:市)?`, "g"), "")
    .replace(/(?:姓名|我叫|名字|手机|电话|邮箱|城市|所在地|现居|目前在|求职城市|意向城市)[：:\s是为]*/g, " ");
  const name = explicitName ?? withoutContacts
    .split(/[，,、；;\s|/]+/)
    .map((part) => part.trim())
    .find((part) => /^[\u4e00-\u9fa5A-Za-z·]{2,16}$/.test(part));

  if (name) next.basicInfo.name = name;
  if (phone) next.basicInfo.phone = phone;
  if (email) next.basicInfo.email = email;
  if (city) next.basicInfo.location = city;

  return next;
}

function createResumeWizardQuestion(step, index) {
  if (!step) return RESUME_WIZARD_DONE;
  return `第 ${index + 1} 步 / ${resumeWizardSteps.length}：${step.label}\n${step.question}`;
}

function DashboardPage({ navigate, routeKey }) {
  const savedDraft = typeof window === "undefined" ? "" : window.localStorage.getItem(AI_RESUME_DRAFT_KEY);
  const [activeMode, setActiveMode] = useState("chat");
  const [inputValue, setInputValue] = useState(savedDraft ?? "");
  const [jdValue, setJdValue] = useState("");
  const [messageThreads, setMessageThreads] = useState(defaultAssistantMessages);
  const [attachments, setAttachments] = useState([]);
  const [uploadError, setUploadError] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [uploadedResumes, setUploadedResumes] = useState(getSessionResumeUploads);
  const [resumeData, setResumeData] = useState(loadResumeTemplateDraft);
  const [isSidePanelOpen, setIsSidePanelOpen] = useState(false);
  const [sidePanelType, setSidePanelType] = useState(null);
  const [sidePanelView, setSidePanelView] = useState("recommendations");
  const [templateNotice, setTemplateNotice] = useState("");
  const [isGeneratingResume, setIsGeneratingResume] = useState(false);
  const [resumeWizardStepIndex, setResumeWizardStepIndex] = useState(0);
  const [resumeWizardComplete, setResumeWizardComplete] = useState(false);
  const [jobOptimizationContext, setJobOptimizationContext] = useState(null);
  const [optimizationPlan, setOptimizationPlan] = useState(null);
  const [optimizationError, setOptimizationError] = useState("");
  const [optimizationProgress, setOptimizationProgress] = useState({ percent: 0, stage: 0 });
  const [jdImageStatus, setJdImageStatus] = useState({ state: "idle", message: "" });
  const [resumeGenerationContext, setResumeGenerationContext] = useState(null);
  const messageListRef = useRef(null);
  const attachmentInputRef = useRef(null);
  const modeUploadInputRef = useRef(null);
  const jdImageInputRef = useRef(null);
  const textareaRef = useRef(null);
  const typewriterTimersRef = useRef(new Set());
  const optimizationAbortRef = useRef(null);
  const optimizationProgressTimerRef = useRef(null);

  const selectedMode = aiResumeModes.find((mode) => mode.key === activeMode);
  const activeMessages = messageThreads[activeMode] ?? messageThreads.chat;
  const chatTitle = selectedMode ? `小律 · ${selectedMode.title}助手` : "小律 · AI简历助手";
  const chatSubtitle = selectedMode ? "独立对话" : "在线";
  const resumeWizardCurrentStep = resumeWizardSteps[resumeWizardStepIndex] ?? null;
  const resumeWizardCompletedCount = countCompletedResumeWizardSteps(resumeData);
  const composerPlaceholder = activeMode === "generate" && resumeWizardCurrentStep
    ? resumeWizardCurrentStep.placeholder
    : selectedMode?.placeholder ?? "和小律聊聊你的简历或求职问题……";
  const liveResumeData = useMemo(() => (
    activeMode === "generate" && inputValue.trim()
      ? applyResumeWizardAnswer(resumeData, resumeWizardCurrentStep, inputValue)
      : resumeData
  ), [activeMode, inputValue, resumeData, resumeWizardCurrentStep]);
  const recommendedTemplates = useMemo(() => recommendResumeTemplates(liveResumeData, activeMessages), [liveResumeData, activeMessages]);
  const selectedTemplate = resumeTemplates.find((template) => template.id === resumeData.selectedTemplate) ?? recommendedTemplates[0] ?? resumeTemplates[0];

  useEffect(() => {
    window.localStorage.setItem(AI_RESUME_DRAFT_KEY, inputValue);
  }, [inputValue]);

  useEffect(() => {
    saveSessionResumeUploads(uploadedResumes);
  }, [uploadedResumes]);

  useEffect(() => {
    saveResumeTemplateDraft(resumeData);
  }, [resumeData]);

  useEffect(() => {
    if (activeMode !== "optimize" || !jobOptimizationContext || optimizationPlan) return;
    const cachedPlan = loadOptimizationReport(jobOptimizationContext, jdValue);
    if (cachedPlan) setOptimizationPlan(cachedPlan);
  }, [activeMode, jobOptimizationContext, jdValue, optimizationPlan]);

  useEffect(() => () => {
    optimizationAbortRef.current?.abort();
    if (optimizationProgressTimerRef.current) window.clearInterval(optimizationProgressTimerRef.current);
  }, []);

  useEffect(() => {
    document.body.classList.add("ai-resume-active");
    return () => {
      document.body.classList.remove("ai-resume-active");
      clearTypewriterTimers();
    };
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const mode = params.get("mode");
    const jobType = params.get("jobType");
    const jobId = params.get("jobId");
    const resumeId = params.get("resumeId");
    const diagnosisId = params.get("diagnosisId");
    const issueId = params.get("issueId");
    let diagnosisHandoff = null;
    try {
      diagnosisHandoff = JSON.parse(window.sessionStorage.getItem("guangqi-careerai-diagnosis-to-optimization") || "null");
    } catch {
      diagnosisHandoff = null;
    }
    if (!["optimize", "generate", "diagnose"].includes(mode)) {
      setResumeGenerationContext(null);
      setJobOptimizationContext(null);
      if (activeMode !== "chat" && window.location.pathname === "/dashboard") {
        setActiveMode("chat");
        setSidePanelType(null);
        setIsSidePanelOpen(false);
      }
      return;
    }
    if (mode === "diagnose") {
      setActiveMode("diagnose");
      setSidePanelType("diagnosis");
      setIsSidePanelOpen(true);
      setResumeGenerationContext(null);
      setJobOptimizationContext(null);
      setOptimizationPlan(null);
      setOptimizationError("");
      return;
    }
    if (mode === "generate" && (!jobType || !jobId)) {
      setActiveMode("generate");
      setSidePanelType("generation");
      setIsSidePanelOpen(true);
      setSidePanelView("preview");
      setResumeGenerationContext(null);
      setJobOptimizationContext(null);
      setOptimizationPlan(null);
      setOptimizationError("");
      return;
    }
    if (mode === "optimize" && resumeId && diagnosisId && (!jobType || !jobId)) {
      const resume = getSessionResumeUploads().find((item) => String(item.id) === String(resumeId));
      setActiveMode("optimize");
      setSidePanelType("optimization");
      setIsSidePanelOpen(true);
      setJobOptimizationContext({
        jobType: null,
        jobId: null,
        resumeId,
        diagnosisId,
        issueId,
        handoff: diagnosisHandoff,
        jd: diagnosisHandoff?.jd ?? "",
        company: "诊断报告",
        role: "按问题优先级优化",
        sourceLabel: "简历诊断报告",
        resumeName: resume?.fileName ?? "已选择简历",
      });
      if (diagnosisHandoff?.jd) setJdValue(String(diagnosisHandoff.jd));
      setResumeGenerationContext(null);
      setTemplateNotice("已载入诊断上下文。点击“生成优化方案”后会调用与聊天、诊断共用的后端大模型，不会自动覆盖原简历。");
      return;
    }
    if (mode === "optimize" && (!jobType || !jobId)) {
      setActiveMode("optimize");
      setSidePanelType("optimization");
      setIsSidePanelOpen(true);
      setResumeGenerationContext(null);
      setJobOptimizationContext(null);
      setOptimizationPlan(null);
      setOptimizationError("");
      return;
    }
    if (!jobType || !jobId) return;

    let cancelled = false;
    const controller = new AbortController();
    const normalizedType = jobType === "internship" ? "internship" : "campus";
    const resume = getSessionResumeUploads().find((item) => String(item.id) === String(resumeId));

    loadRecruitmentJobs(normalizedType, { page: 0 }, { signal: controller.signal })
      .then((result) => {
        if (cancelled) return;
        const jobs = Array.isArray(result?.jobs) ? result.jobs : [];
        const job = jobs.find((item) => String(item.id) === String(jobId));

        if (mode === "generate") {
          setActiveMode("generate");
          setSidePanelType("generation");
          setIsSidePanelOpen(true);
          setResumeGenerationContext({
            jobType: normalizedType,
            jobId,
            resumeId,
            diagnosisId,
            issueId,
            company: job?.company ?? "目标公司",
            role: job?.role ?? "目标岗位",
            sourceLabel: normalizedType === "internship" ? "实习" : "校招",
            resumeName: resume?.fileName ?? "已选择简历",
          });
          setTemplateNotice("已载入岗位上下文。简历生成工作台不会自动请求AI。");
          return;
        }

        if (!resumeId) return;

        setActiveMode("optimize");
        setSidePanelType("optimization");
        setIsSidePanelOpen(true);
        setJobOptimizationContext({
          jobType: normalizedType,
          jobId,
          resumeId,
          diagnosisId,
          issueId,
          company: job?.company ?? "目标公司",
          role: job?.role ?? "目标岗位",
          sourceLabel: normalizedType === "internship" ? "实习" : "校招",
          resumeName: resume?.fileName ?? "已选择简历",
        });
        setResumeGenerationContext(null);
        setTemplateNotice("已载入岗位上下文。点击“开始针对该岗位优化”后才会请求AI，不会在页面加载时自动分析。");
      })
      .catch((error) => {
        if (controller.signal.aborted || cancelled) return;
        setTemplateNotice(error.message || "招聘岗位上下文加载失败，请确认局域网后端可访问。");
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [routeKey]);

  useEffect(() => {
    if (!isSidePanelOpen) return undefined;

    function handleKeyDown(event) {
      if (event.key === "Escape") exitFeatureMode();
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isSidePanelOpen]);

  function scrollMessagesToBottom(behavior = "smooth") {
    const container = messageListRef.current;
    if (!container) return;
    container.scrollTo({
      top: container.scrollHeight,
      behavior,
    });
  }

  useEffect(() => {
    scrollMessagesToBottom();
  }, [activeMessages, isSending]);

  useEffect(() => {
    if (!textareaRef.current) return;
    textareaRef.current.style.height = "auto";
    textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 136)}px`;
  }, [inputValue]);

  function clearTypewriterTimers() {
    typewriterTimersRef.current.forEach((timer) => window.clearTimeout(timer));
    typewriterTimersRef.current.clear();
  }

  function updateModeMessages(modeKey, updater) {
    setMessageThreads((current) => {
      const currentMessages = current[modeKey] ?? [];
      const nextMessages = typeof updater === "function" ? updater(currentMessages) : updater;
      return {
        ...current,
        [modeKey]: nextMessages,
      };
    });
  }

  function resetModeConversation(modeKey) {
    if (modeKey === "generate") {
      beginResumeWizard();
      return;
    }

    clearTypewriterTimers();
    updateModeMessages(modeKey, defaultAssistantMessages[modeKey] ?? defaultAssistantMessages.chat);
  }

  function waitForTypewriterFrame(delay) {
    return new Promise((resolve) => {
      const timer = window.setTimeout(() => {
        typewriterTimersRef.current.delete(timer);
        resolve();
      }, delay);
      typewriterTimersRef.current.add(timer);
    });
  }

  async function typeAssistantMessage(messageId, fullText, modeKey = activeMode) {
    const text = fullText ?? "";
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    if (reduceMotion || text.length === 0) {
      updateModeMessages(modeKey, (current) => current.map((message) => (
        message.id === messageId ? { ...message, text, typing: false } : message
      )));
      return;
    }

    const chunkSize = text.length > TYPEWRITER_LONG_REPLY_THRESHOLD ? 3 : 2;
    const delay = text.length > TYPEWRITER_LONG_REPLY_THRESHOLD ? TYPEWRITER_FAST_DELAY_MS : TYPEWRITER_DELAY_MS;
    let cursor = 0;

    while (cursor < text.length) {
      cursor = Math.min(cursor + chunkSize, text.length);
      updateModeMessages(modeKey, (current) => current.map((message) => (
        message.id === messageId
          ? { ...message, text: text.slice(0, cursor), typing: cursor < text.length }
          : message
      )));

      if (cursor < text.length) {
        await waitForTypewriterFrame(delay);
      }
    }
  }

  async function appendStreamingTypewriterChunk(messageId, chunk, modeKey = activeMode) {
    const text = chunk ?? "";
    if (!text) return;

    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion) {
      updateModeMessages(modeKey, (current) => current.map((message) => (
        message.id === messageId
          ? { ...message, text: `${message.text}${text}`, typing: true }
          : message
      )));
      return;
    }

    const chunkSize = text.length > TYPEWRITER_LONG_REPLY_THRESHOLD ? 3 : 2;
    const delay = text.length > TYPEWRITER_LONG_REPLY_THRESHOLD ? TYPEWRITER_FAST_DELAY_MS : TYPEWRITER_DELAY_MS;
    let cursor = 0;

    while (cursor < text.length) {
      const nextCursor = Math.min(cursor + chunkSize, text.length);
      const nextText = text.slice(cursor, nextCursor);
      updateModeMessages(modeKey, (current) => current.map((message) => (
        message.id === messageId
          ? { ...message, text: `${message.text}${nextText}`, typing: true }
          : message
      )));
      cursor = nextCursor;
      if (cursor < text.length) await waitForTypewriterFrame(delay);
    }
  }

  function addTypingAssistantMessage(fullText, messageId = `assistant_${Date.now()}`, modeKey = activeMode) {
    updateModeMessages(modeKey, (current) => [
      ...current,
      {
        id: messageId,
        role: "assistant",
        text: "",
        typing: true,
      },
    ]);
    return typeAssistantMessage(messageId, fullText, modeKey);
  }

  function beginResumeWizard() {
    const nextIndex = getNextResumeWizardStepIndex(resumeData);
    const nextStep = resumeWizardSteps[nextIndex] ?? null;
    const questionId = `wizard_${Date.now()}`;

    clearTypewriterTimers();
    setActiveMode("generate");
    setResumeWizardStepIndex(nextIndex);
    setResumeWizardComplete(!nextStep);
    setInputValue("");
    setTemplateNotice("按左侧问题逐步回答，右侧简历会实时同步更新。");
    updateModeMessages("generate", [
      {
        id: `wizard_intro_${Date.now()}`,
        role: "assistant",
        text: RESUME_WIZARD_INTRO,
      },
      {
        id: questionId,
        role: "assistant",
        text: "",
        typing: true,
      },
    ]);
    typeAssistantMessage(questionId, createResumeWizardQuestion(nextStep, nextIndex), "generate");
  }

  async function handleResumeWizardAnswer({ userMessage, text, files }) {
    const answer = cleanResumeAnswer(text || "");
    const currentStep = resumeWizardSteps[resumeWizardStepIndex] ?? null;

    updateModeMessages("generate", (current) => [...current, userMessage]);
    setInputValue("");
    setIsSending(true);

    const shouldSkip = /^(跳过|略过|下一步|skip)$/i.test(answer);
    const nextData = currentStep && !shouldSkip
      ? applyResumeWizardAnswer(resumeData, currentStep, answer)
      : inferResumeDataFromText(resumeData, answer);

    setResumeData(nextData);
    if (files.length > 0) {
      setTemplateNotice("已记录上传文件名。当前流程会优先根据你在左侧输入的文字同步到右侧简历。");
    } else if (currentStep && !shouldSkip) {
      setTemplateNotice(`已同步「${currentStep.label}」到右侧简历预览。`);
    } else if (shouldSkip) {
      setTemplateNotice("已跳过当前问题，你可以稍后继续补充。");
    }

    const nextIndex = currentStep
      ? getNextResumeWizardStepIndex(nextData, resumeWizardStepIndex + 1)
      : getNextResumeWizardStepIndex(nextData);
    const nextStep = resumeWizardSteps[nextIndex] ?? null;

    setResumeWizardStepIndex(nextIndex);
    setResumeWizardComplete(!nextStep);

    try {
      if (nextStep) {
        await addTypingAssistantMessage(createResumeWizardQuestion(nextStep, nextIndex), `wizard_${Date.now()}`, "generate");
      } else {
        await addTypingAssistantMessage(RESUME_WIZARD_DONE, `wizard_done_${Date.now()}`, "generate");
      }
      setAttachments([]);
    } finally {
      setIsSending(false);
    }
  }

  function openFeature(modeKey) {
    const nextMode = aiResumeModes.find((mode) => mode.key === modeKey);
    if (!nextMode) return;
    // Placeholder shortcut: clicking AI面试 intentionally does nothing for now.
    if (modeKey === "question-bank") { navigate("/question-bank"); return; }
    const panelMap = {
      generate: "generation",
      diagnose: "diagnosis",
      optimize: "optimization",
    };
    const pageScrollY = window.scrollY;
    setActiveMode(modeKey);
    setSidePanelType(panelMap[modeKey]);
    setIsSidePanelOpen(true);
    setTemplateNotice("");
    setOptimizationError("");
    if (modeKey !== "optimize") setOptimizationPlan(null);
    if (modeKey !== "optimize") setJobOptimizationContext(null);
    if (modeKey !== "generate") setResumeGenerationContext(null);
    if (modeKey === "generate") {
      setSidePanelView("preview");
    } else if ((messageThreads[modeKey] ?? []).length === 0) {
      addTypingAssistantMessage(nextMode.prompt, `mode_${modeKey}_${Date.now()}`);
    }
    window.requestAnimationFrame(() => window.scrollTo({ top: pageScrollY, behavior: "auto" }));
  }

  function restoreFeaturePanel() {
    if (!sidePanelType || activeMode === "chat") return;
    const pageScrollY = window.scrollY;
    setIsSidePanelOpen(true);
    window.requestAnimationFrame(() => window.scrollTo({ top: pageScrollY, behavior: "auto" }));
  }

  function collapseSidePanel() {
    const pageScrollY = window.scrollY;
    setIsSidePanelOpen(false);
    window.requestAnimationFrame(() => window.scrollTo({ top: pageScrollY, behavior: "auto" }));
  }

  function exitFeatureMode() {
    const pageScrollY = window.scrollY;
    setIsSidePanelOpen(false);
    setActiveMode("chat");
    setSidePanelType(null);
    setSidePanelView("recommendations");
    setJobOptimizationContext(null);
    setOptimizationPlan(null);
    setOptimizationError("");
    setResumeGenerationContext(null);
    window.requestAnimationFrame(() => window.scrollTo({ top: pageScrollY, behavior: "auto" }));
  }

  function navigateFromTemplatePanel(path) {
    if (!navigate) return;
    const hasUnsavedInput = inputValue.trim() || jdValue.trim();
    if (hasUnsavedInput && !window.confirm("当前简历还有未保存的修改，是否继续前往岗位页面？")) return;
    navigate(path);
  }

  function startOptimizationProgress() {
    if (optimizationProgressTimerRef.current) window.clearInterval(optimizationProgressTimerRef.current);
    setOptimizationProgress({ percent: 18, stage: 0 });
    optimizationProgressTimerRef.current = window.setInterval(() => {
      setOptimizationProgress((current) => {
        const nextPercent = current.percent < 42
          ? Math.min(42, current.percent + 4)
          : current.percent < 67
            ? Math.min(67, current.percent + 3)
            : current.percent < 83
              ? Math.min(83, current.percent + 1)
              : current.percent;
        const stage = nextPercent >= 78 ? 4 : nextPercent >= 62 ? 3 : nextPercent >= 42 ? 2 : nextPercent >= 25 ? 1 : 0;
        return { percent: nextPercent, stage };
      });
    }, 850);
  }

  function stopOptimizationProgress(completed = false) {
    if (optimizationProgressTimerRef.current) {
      window.clearInterval(optimizationProgressTimerRef.current);
      optimizationProgressTimerRef.current = null;
    }
    setOptimizationProgress(completed ? { percent: 100, stage: 4 } : { percent: 0, stage: 0 });
  }

  function cancelOptimizationGeneration() {
    optimizationAbortRef.current?.abort();
    optimizationAbortRef.current = null;
    stopOptimizationProgress(false);
    setIsGeneratingResume(false);
    setOptimizationError("");
    setTemplateNotice("已取消生成优化方案。");
  }

  function startJobOptimization() {
    if (isGeneratingResume) {
      cancelOptimizationGeneration();
      return;
    }
    generateOptimizationPlan();
  }

  async function handleJdImageFiles(fileList) {
    const file = Array.from(fileList ?? [])[0];
    if (!file) return;
    if (file.type === "text/plain" || /\.txt$/i.test(file.name)) {
      if (file.size > 2 * 1024 * 1024) {
        setJdImageStatus({ state: "error", message: "JD 文本文件不能超过 2MB。" });
        if (jdImageInputRef.current) jdImageInputRef.current.value = "";
        return;
      }
      setJdImageStatus({ state: "loading", message: `正在读取 ${file.name}...` });
      try {
        const parsedText = (await file.text()).trim();
        if (!parsedText) {
          setJdImageStatus({ state: "error", message: "JD 文本文件为空，请粘贴岗位描述。" });
          return;
        }
        setJdValue((current) => {
          const trimmed = current.trim();
          return trimmed ? `${trimmed}\n\n${parsedText}` : parsedText;
        });
        setOptimizationPlan(null);
        setOptimizationError("");
        setJdImageStatus({ state: "done", message: `已导入 JD 文本：${file.name}` });
        setTemplateNotice("JD 文本已写入输入框，点击一键优化后会随简历一起提交给真实AI优化接口。");
      } catch (error) {
        setJdImageStatus({ state: "error", message: error.message || "JD 文本读取失败，请手动粘贴。" });
      } finally {
        if (jdImageInputRef.current) jdImageInputRef.current.value = "";
      }
      return;
    }
    if (!file.type?.startsWith("image/")) {
      setJdImageStatus({ state: "error", message: "请上传 JD 截图图片。" });
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setJdImageStatus({ state: "error", message: "JD 图片不能超过 8MB。" });
      return;
    }

    setJdImageStatus({ state: "loading", message: `正在识别 ${file.name}...` });
    try {
      const result = await parseJdImage(file);
      const parsedText = String(result.jobDescription ?? "").trim();
      if (!parsedText) {
        setJdImageStatus({ state: "error", message: "没有从图片中识别到有效 JD 文本。" });
        return;
      }
      setJdValue((current) => {
        const trimmed = current.trim();
        return trimmed ? `${trimmed}\n\n${parsedText}` : parsedText;
      });
      setOptimizationPlan(null);
      setOptimizationError("");
      setJdImageStatus({ state: "done", message: `已识别 JD 图片：${file.name}` });
      setTemplateNotice("JD 图片已解析并写入文本框，点击“生成优化方案”会基于这段 JD 生成方案。");
    } catch (error) {
      setJdImageStatus({ state: "error", message: error.message || "JD 图片识别失败，请手动粘贴 JD 文本。" });
    } finally {
      if (jdImageInputRef.current) jdImageInputRef.current.value = "";
    }
  }

  function openTemplatePanel(view = sidePanelView) {
    const pageScrollY = window.scrollY;
    setSidePanelType("template");
    setIsSidePanelOpen(true);
    setSidePanelView(view);
    window.requestAnimationFrame(() => window.scrollTo({ top: pageScrollY, behavior: "auto" }));
  }

  function selectTemplate(template, view = "preview") {
    const pageScrollY = window.scrollY;
    setResumeData((current) => ({ ...current, selectedTemplate: template.id }));
    setSidePanelView(view);
    setTemplateNotice(`已选择「${template.name}」，右侧预览会继续根据你的补充内容更新。`);
    setSidePanelType("template");
    setIsSidePanelOpen(true);
    window.requestAnimationFrame(() => window.scrollTo({ top: pageScrollY, behavior: "auto" }));
  }

  function saveResumeDraft() {
    saveResumeTemplateDraft(resumeData);
    setTemplateNotice("草稿已保存在当前浏览器。");
  }

  function saveOptimizedResumeVersion() {
    if (!optimizationPlan) {
      setOptimizationError("请先完成一次真实AI优化。");
      return;
    }
    const version = {
      id: `optimized_resume_${Date.now()}`,
      sourceResumeId: jobOptimizationContext?.resumeId ?? uploadedResumes[0]?.id ?? null,
      resumeName: optimizationPlan.resumeName ?? jobOptimizationContext?.resumeName ?? "优化版简历",
      targetRole: jobOptimizationContext?.role ?? optimizationPlan.targetRole ?? "",
      plan: optimizationPlan,
      createdAt: new Date().toISOString(),
    };
    try {
      const key = "guangqi-optimized-resume-versions";
      const current = JSON.parse(window.localStorage.getItem(key) || "[]");
      window.localStorage.setItem(key, JSON.stringify([version, ...(Array.isArray(current) ? current : [])]));
      setTemplateNotice("已保存为新版本，不会覆盖原简历。");
      setOptimizationError("");
    } catch {
      setOptimizationError("保存新版本失败，请稍后重试。");
    }
  }

  function downloadOptimizedResume() {
    if (!optimizationPlan) {
      setOptimizationError("请先完成一次真实AI优化。");
      return;
    }
    const printWindow = window.open("", "_blank", "noopener,noreferrer");
    if (!printWindow) {
      setOptimizationError("浏览器阻止了PDF预览窗口，请允许弹窗后重试。");
      return;
    }
    const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "\"": "&quot;",
      "'": "&#39;",
    })[char]);
    const summaryItems = (optimizationPlan.summaryPoints ?? optimizationPlan.summary ?? [])
      .map((item) => `<li>${escapeHtml(item)}</li>`)
      .join("");
    const taskItems = (optimizationPlan.tasks ?? []).map((task, index) => `
      <section>
        <h2>${index + 1}. ${escapeHtml(task.section)}</h2>
        <h3>优化前</h3>
        <p>${escapeHtml(task.before)}</p>
        <h3>优化后</h3>
        <p>${escapeHtml(task.after)}</p>
        <small>${escapeHtml(task.reason)}</small>
      </section>
    `).join("");
    printWindow.document.write(`<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <title>${escapeHtml(optimizationPlan.resumeName ?? "AI简历优化版")}</title>
  <style>
    body { margin: 0; background: #eef4fb; color: #102033; font-family: "Microsoft YaHei", Arial, sans-serif; }
    .toolbar { display: flex; justify-content: space-between; align-items: center; padding: 12px 18px; background: #071827; color: #dffdfa; font-size: 13px; }
    .toolbar button { border: 0; border-radius: 999px; padding: 8px 16px; background: linear-gradient(135deg, #22dac5, #3a8dff); color: #041322; font-weight: 800; cursor: pointer; }
    main { width: 210mm; min-height: 297mm; margin: 18px auto; padding: 22mm 18mm; box-sizing: border-box; background: #fff; box-shadow: 0 18px 45px rgba(15, 35, 60, 0.18); }
    h1 { margin: 0 0 8px; font-size: 26px; color: #071827; }
    .meta { margin: 0 0 22px; color: #526276; }
    .summary { margin: 0 0 22px; padding: 16px 18px; border-radius: 14px; background: #eef8ff; }
    section { margin: 0 0 18px; padding: 16px 0 0; border-top: 1px solid #d9e5f2; }
    h2 { margin: 0 0 12px; font-size: 17px; color: #0d3158; }
    h3 { margin: 12px 0 6px; font-size: 13px; color: #2370b8; }
    p, li, small { line-height: 1.75; }
    small { display: block; color: #607287; }
    .safe { margin-top: 28px; color: #5e6f84; font-size: 12px; }
    @media print { .toolbar { display: none !important; } main { margin: 0; box-shadow: none; } }
  </style>
</head>
<body>
  <div class="toolbar">
    <span>AI简历优化版 · 请选择“另存为 PDF”完成下载</span>
    <button type="button" onclick="window.print()">打印 / 另存为 PDF</button>
  </div>
  <main>
    <h1>AI简历优化版</h1>
    <p class="meta">简历：${escapeHtml(optimizationPlan.resumeName ?? jobOptimizationContext?.resumeName ?? "当前简历")} · 目标岗位：${escapeHtml(jobOptimizationContext?.role ?? optimizationPlan.targetRole ?? "未填写")} · ${escapeHtml(new Date(optimizationPlan.generatedAt ?? Date.now()).toLocaleString("zh-CN"))}</p>
    <div class="summary"><strong>优化亮点</strong><ul>${summaryItems}</ul></div>
    ${taskItems}
    <p class="safe">声明：AI 不会自动覆盖原简历；所有数字、经历和成果必须由用户确认真实后再写入正式简历。</p>
  </main>
  <script>window.addEventListener("load", function () { window.setTimeout(function () { window.print(); }, 300); });</script>
</body>
</html>`);
    printWindow.document.close();
    setTemplateNotice("已打开PDF预览窗口，请选择“另存为 PDF”完成下载。");
    return;
    const lines = [
      "AI简历优化报告",
      "",
      `简历：${optimizationPlan.resumeName ?? jobOptimizationContext?.resumeName ?? "当前简历"}`,
      `目标岗位：${jobOptimizationContext?.role ?? optimizationPlan.targetRole ?? "未填写"}`,
      `生成时间：${new Date(optimizationPlan.generatedAt ?? Date.now()).toLocaleString("zh-CN")}`,
      "",
      "优化亮点",
      ...(optimizationPlan.summaryPoints ?? optimizationPlan.summary ?? []).map((item, index) => `${index + 1}. ${item}`),
      "",
      "优化前 VS 优化后",
      ...(optimizationPlan.tasks ?? []).flatMap((task, index) => [
        `${index + 1}. ${task.section}`,
        `优化前：${task.before}`,
        `优化后：${task.after}`,
        `说明：${task.reason}`,
        "",
      ]),
      "声明：AI不会自动覆盖原简历；所有数字、经历和成果必须由用户确认真实后再写入。",
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${optimizationPlan.resumeName ?? "optimized-resume"}-AI优化版.txt`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    setTemplateNotice("已下载当前优化版本。");
  }

  async function generateOptimizationPlan() {
    if (isGeneratingResume) return;

    const selectedResume = jobOptimizationContext?.resumeId
      ? uploadedResumes.find((resume) => String(resume.id) === String(jobOptimizationContext.resumeId))
      : uploadedResumes[0];
    const isDiagnosisOptimization = Boolean(jobOptimizationContext?.diagnosisId || jobOptimizationContext?.sourceLabel === "简历诊断报告");
    const contextText = isDiagnosisOptimization ? "" : [
      jobOptimizationContext?.company,
      jobOptimizationContext?.role,
      jobOptimizationContext?.sourceLabel,
    ].filter(Boolean).join(" ");
    const jdText = jdValue.trim() || contextText;

    if (!selectedResume && !jobOptimizationContext?.resumeId) {
      setTemplateNotice("请先上传或选择一份简历，再生成优化方案。");
      setOptimizationError("缺少简历文件。");
      return;
    }

    const controller = new AbortController();
    optimizationAbortRef.current?.abort();
    optimizationAbortRef.current = controller;

    setIsGeneratingResume(true);
    setOptimizationError("");
    startOptimizationProgress();
    setTemplateNotice("正在调用与聊天、诊断共用的后端大模型生成真实优化方案。");

    const fallbackContext = {
      resume: selectedResume,
      jd: jdText,
      context: jobOptimizationContext,
    };

    try {
      let plan;
      try {
        const result = await requestResumeAdvice({
          resumeId: jobOptimizationContext?.resumeId ?? selectedResume?.id ?? null,
          resumeName: selectedResume?.fileName ?? jobOptimizationContext?.resumeName ?? null,
          jobId: jobOptimizationContext?.jobId ?? null,
          jobType: jobOptimizationContext?.jobType?.toUpperCase?.() ?? null,
          diagnosisId: jobOptimizationContext?.diagnosisId ?? null,
          issueId: jobOptimizationContext?.issueId ?? null,
          targetRole: jobOptimizationContext?.role ?? null,
          targetCompany: jobOptimizationContext?.company ?? null,
          jobDescription: jdText || null,
          requestId: window.crypto?.randomUUID?.() ?? `resume-optimize-${Date.now()}`,
        }, { signal: controller.signal });
        plan = normalizeOptimizationPlan(result, fallbackContext);
      } catch (error) {
        if (controller.signal.aborted || error?.name === "AbortError") {
          setTemplateNotice("已取消生成优化方案。");
          return;
        }
        const message = error.message || "AI简历优化失败，请稍后重试。";
        stopOptimizationProgress(false);
        setOptimizationError(message);
        setTemplateNotice(message);
        return;
      }

      if (controller.signal.aborted) {
        setTemplateNotice("已取消生成优化方案。");
        return;
      }
      stopOptimizationProgress(plan?.source === "remote");
      setOptimizationPlan(plan);
      saveOptimizationReport(jobOptimizationContext, jdText, plan);
      setTemplateNotice(plan.source === "remote"
        ? "已生成真实AI优化方案。聊天、诊断和优化共用同一个后端大模型，请逐项确认后再手动修改简历。"
        : "真实AI优化生成失败，已临时显示本地预览方案。请检查后端模型服务后重新生成。");
      await addTypingAssistantMessage(
        `优化方案已生成：优先处理「${plan.tasks[0]?.section ?? "求职目标"}」。我不会自动覆盖原简历，你可以在右侧逐项查看原问题、建议写法和原因。`,
        `optimize_plan_${Date.now()}`,
        "optimize",
      );
    } finally {
      if (optimizationAbortRef.current === controller) optimizationAbortRef.current = null;
      if (!controller.signal.aborted) setIsGeneratingResume(false);
    }
  }

  function generateResume() {
    if (sidePanelType === "optimization") {
      generateOptimizationPlan();
      return;
    }

    if (activeMode === "generate") {
      setTemplateNotice("请在左侧生成工作台中完成必填信息后生成简历。");
      return;
    }

    setIsGeneratingResume(true);
    window.setTimeout(() => {
      setIsGeneratingResume(false);
      setTemplateNotice("简历生成接口尚未连接，当前仅展示前端预览。");
    }, 420);
  }

  function removeAttachment(id) {
    setAttachments((current) => current.filter((attachment) => attachment.id !== id));
    setUploadError("");
  }

  function removeUploadedResume(resumeId) {
    setUploadedResumes((current) => {
      const next = current.filter((resume) => String(resume.id) !== String(resumeId));
      const lastId = window.sessionStorage.getItem(LAST_UPLOADED_RESUME_KEY);
      if (String(lastId) === String(resumeId)) {
        if (next[0]?.id) {
          window.sessionStorage.setItem(LAST_UPLOADED_RESUME_KEY, next[0].id);
        } else {
          window.sessionStorage.removeItem(LAST_UPLOADED_RESUME_KEY);
        }
      }
      return next;
    });
    setAttachments((current) => current.filter((attachment) => String(attachment.resumeRecord?.id) !== String(resumeId)));
    setUploadError("");
  }

  async function addFiles(fileList) {
    const nextFiles = Array.from(fileList ?? []);
    if (nextFiles.length === 0) return;

    const prepared = [];
    for (const file of nextFiles) {
      const duplicate = attachments.some((attachment) => {
        const sameName = attachment.file.name.toLowerCase() === file.name.toLowerCase();
        const statusText = String(attachment.status ?? "");
        const stillProcessing = statusText.includes("上传") || statusText.includes("解析") || statusText.includes("等待");
        return sameName && stillProcessing && statusText !== "上传成功" && !statusText.includes("失败");
      });
      if (duplicate) {
        setUploadError(`已选择同名文件「${file.name}」，请删除后重新选择。`);
        return;
      }

      const validationError = validateResumeFile(file);
      if (validationError) {
        setUploadError(validationError);
        return;
      }

      prepared.push({
        id: `file_${Date.now()}_${Math.random().toString(16).slice(2)}`,
        file,
        status: "正在上传",
        progress: 0,
      });
    }

    setUploadError("");
    setAttachments((current) => [...current, ...prepared]);

    for (const attachment of prepared) {
      const uploadStartedAt = performance.now();
      let parsingStartedAt = null;
      try {
        const uploadResult = await uploadResumeFile(attachment.file, {
          onProgress: (progress) => {
            setAttachments((current) => current.map((item) => (
              item.id === attachment.id ? { ...item, progress, status: "正在上传" } : item
            )));
          },
          onParsing: () => {
            parsingStartedAt = performance.now();
            setAttachments((current) => current.map((item) => (
              item.id === attachment.id ? { ...item, progress: 100, status: "正在解析" } : item
            )));
          },
        });

        const record = createResumeRecord(attachment.file.name, attachment.file, uploadResult);
        setUploadedResumes((current) => [record, ...current]);
        if (activeMode === "optimize" && sidePanelType === "optimization") {
          setJobOptimizationContext((current) => ({
            ...(current ?? {}),
            resumeId: record.id,
            resumeName: record.fileName,
          }));
          setOptimizationPlan(null);
          setOptimizationError("");
        }
        window.sessionStorage.setItem(LAST_UPLOADED_RESUME_KEY, record.id);
        setAttachments((current) => current.map((item) => (
          item.id === attachment.id ? { ...item, progress: 100, status: "上传成功", resumeRecord: record } : item
        )));
        console.info("[resume-diagnosis:upload-timing]", {
          fileName: attachment.file.name,
          fileSize: attachment.file.size,
          textLength: record.textLength,
          uploadAndParseMs: Math.round(performance.now() - uploadStartedAt),
          parsePhaseMs: parsingStartedAt ? Math.round(performance.now() - parsingStartedAt) : null,
        });
      } catch {
        setAttachments((current) => current.map((item) => (
          item.id === attachment.id ? { ...item, status: "上传失败，请重试" } : item
        )));
        console.info("[resume-diagnosis:upload-timing]", {
          fileName: attachment.file.name,
          fileSize: attachment.file.size,
          failed: true,
          uploadAndParseMs: Math.round(performance.now() - uploadStartedAt),
        });
      }
    }
  }

  function handleDragOver(event) {
    event.preventDefault();
    setIsDragging(true);
  }

  function handleDrop(event) {
    event.preventDefault();
    setIsDragging(false);
    addFiles(event.dataTransfer.files);
  }

  async function sendMessage(payload = null) {
    const modeKey = activeMode;
    const text = payload?.text ?? inputValue.trim();
    const readyAttachments = attachments.filter((attachment) => attachment.status === "上传成功");
    const files = payload?.files ?? readyAttachments.map((attachment) => attachment.file);
    const resumes = payload?.resumes ?? readyAttachments
      .map((attachment) => attachment.resumeRecord)
      .filter(Boolean);
    const jd = payload?.jd ?? jdValue.trim();

    if (isSending || (!text && files.length === 0 && !jd)) return;

    const userMessage = {
      id: `user_${Date.now()}`,
      role: "user",
      text: text || (jd ? "我已补充目标岗位 JD，请帮我继续处理。" : "我已上传简历文件，请帮我分析。"),
      files: files.map((file) => file.name),
      jd,
    };

    const requestPayload = { mode: modeKey, text, jd, files, resumes };
    if (modeKey === "generate") {
      await handleResumeWizardAnswer({ userMessage, text: `${text}\n${jd}`.trim(), files });
      return;
    }
    const assistantMessageId = `assistant_${Date.now()}`;
    let hasStreamedContent = false;
    updateModeMessages(modeKey, (current) => [
      ...current,
      userMessage,
      {
        id: assistantMessageId,
        role: "assistant",
        text: "",
        typing: true,
      },
    ]);
    setInputValue("");
    setIsSending(true);

    try {
      const reply = await sendResumeAssistantMessage({
        mode: modeKey,
        message: text,
        jd,
        files,
        resumes,
        onChunk: async (chunk) => {
          hasStreamedContent = true;
          await appendStreamingTypewriterChunk(assistantMessageId, chunk, modeKey);
        },
      });
      if (!hasStreamedContent) {
        await appendStreamingTypewriterChunk(assistantMessageId, reply, modeKey);
      }
      updateModeMessages(modeKey, (current) => current.map((message) => (
        message.id === assistantMessageId ? { ...message, typing: false } : message
      )));
      setAttachments([]);
    } catch (error) {
      updateModeMessages(modeKey, (current) => current.map((message) => (
        message.id === assistantMessageId
          ? {
            ...message,
            text: message.text || error.message || "AI服务暂未连接，请稍后重试。",
            typing: false,
            error: true,
            retryPayload: requestPayload,
          }
          : message
      )));
    } finally {
      setIsSending(false);
    }
  }

  function handleInputKeyDown(event) {
    if (event.key !== "Enter" || event.shiftKey) return;
    event.preventDefault();
    sendMessage();
  }

  if (activeMode === "generate" && sidePanelType === "generation" && isSidePanelOpen) {
    return (
      <section className="ai-resume-page has-builder-workspace" aria-label="AI简历生成页面">
        <ResumeBuilderWorkspace
          navigate={navigate}
          onExit={exitFeatureMode}
          targetJobContext={resumeGenerationContext}
        />
      </section>
    );
  }

  if (activeMode === "diagnose" && sidePanelType === "diagnosis" && isSidePanelOpen) {
    return (
      <section className="ai-resume-page has-diagnosis-workspace" aria-label="AI简历诊断页面">
        <ResumeDiagnosisWorkspace
          navigate={navigate}
          onExit={exitFeatureMode}
          uploadedResumes={uploadedResumes}
          isDragging={isDragging}
          onDragOver={handleDragOver}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          inputRef={modeUploadInputRef}
          onAddFiles={addFiles}
          uploadError={uploadError}
          attachments={attachments}
          onRemoveAttachment={removeAttachment}
        />
      </section>
    );
  }

  if (activeMode === "optimize" && sidePanelType === "optimization" && isSidePanelOpen) {
    return (
      <section className="ai-resume-page has-optimization-workspace" aria-label="AI resume optimization page">
        <OptimizationPanelContent
          navigate={navigate}
          uploadedResumes={uploadedResumes}
          jdValue={jdValue}
          setJdValue={setJdValue}
          optimizationPlan={optimizationPlan}
          optimizationError={optimizationError}
          optimizationProgress={optimizationProgress}
          jdImageInputRef={jdImageInputRef}
          jdImageStatus={jdImageStatus}
          onParseJdImage={handleJdImageFiles}
          isOptimizing={isGeneratingResume}
          jobOptimizationContext={jobOptimizationContext}
          onStartJobOptimization={startJobOptimization}
          onUpdateOptimizationContext={(patch) => {
            setJobOptimizationContext((current) => ({
              ...(current ?? {}),
              ...patch,
            }));
            setOptimizationPlan(null);
            setOptimizationError("");
          }}
          onSaveOptimizedVersion={saveOptimizedResumeVersion}
          onDownloadOptimizedResume={downloadOptimizedResume}
          onContinueDelivery={() => navigate?.("/campus")}
          onSelectResume={(resume) => {
            setJobOptimizationContext((current) => ({
              ...(current ?? {}),
              resumeId: resume.id,
              resumeName: resume.fileName,
            }));
            setOptimizationPlan(null);
            setOptimizationError("");
            setTemplateNotice(`Selected ${resume.fileName}. Click generate to call the shared model again.`);
          }}
          isDragging={isDragging}
          onDragOver={handleDragOver}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          inputRef={modeUploadInputRef}
          onAddFiles={addFiles}
          uploadError={uploadError}
          attachments={attachments}
          onRemoveAttachment={removeAttachment}
          onExit={exitFeatureMode}
        />
      </section>
    );
  }


  return (
    <section className={`ai-resume-page ${isSidePanelOpen ? "has-template-panel" : ""} ${activeMode === "optimize" ? "is-optimization-workspace" : ""}`} aria-label="AI简历助手页面">
      <div className={`ai-resume-shell ${isSidePanelOpen ? "with-template-panel" : ""} ${activeMode === "optimize" ? "with-optimization-panel" : ""}`}>
        <div className="ai-resume-intro">
          <div className="ai-resume-mark" aria-hidden="true">AI</div>
          <span>AI RESUME ASSISTANT</span>
          <h1>嗨，我是<span>小律</span>，你的AI简历助手</h1>
          <p>从简历生成、诊断到针对岗位的优化，陪你完成一份更有竞争力的简历。</p>
        </div>

        {activeMode !== "optimize" && (
          <section className="ai-chat-card" aria-label="AI简历助手对话框">
            <div className="ai-chat-titlebar">
              <div className="ai-chat-identity">
                <span className="ai-title-avatar" aria-hidden="true">律</span>
                <div>
                  <strong>{chatTitle}</strong>
                  <small>{chatSubtitle}</small>
                </div>
              </div>
              <div className="ai-chat-tools" aria-label="对话工具">
                <button type="button" onClick={() => resetModeConversation(activeMode)}>
                  新建对话
                </button>
                <button type="button">历史记录</button>
                <button type="button" aria-label="更多菜单">···</button>
              </div>
            </div>

            <div className="ai-message-list" ref={messageListRef}>
              {activeMessages.map((message) => (
                <div className={`ai-message-row ${message.role === "user" ? "is-user" : "is-assistant"} ${message.error ? "is-error" : ""}`} key={message.id}>
                  {message.role === "assistant" && <span className="ai-avatar" aria-hidden="true">律</span>}
                  <div className={`ai-message-bubble ${message.typing ? "is-typing" : ""}`}>
                    <p>{message.text}</p>
                    {message.jd && <small>已附带目标岗位 JD</small>}
                    {message.files?.length > 0 && <small>{message.files.join("、")}</small>}
                    {message.error && (
                      <button className="ai-retry-button" type="button" onClick={() => sendMessage(message.retryPayload)} disabled={isSending}>
                        重新发送
                      </button>
                    )}
                  </div>
                </div>
              ))}
              {isSending && activeMode !== "generate" && !activeMessages.some((message) => message.typing) && (
                <div className="ai-message-row is-assistant">
                  <span className="ai-avatar" aria-hidden="true">律</span>
                  <div className="ai-thinking" aria-label="正在思考">
                    <span />
                    <span />
                    <span />
                  </div>
                </div>
              )}
            </div>

            {!isSidePanelOpen && activeMode !== "chat" && sidePanelType && (
              <button className="feature-resume-button" type="button" onClick={restoreFeaturePanel}>
                继续{selectedMode?.title}
              </button>
            )}

            <div className="ai-mode-grid" aria-label="快捷功能">
              {aiResumeModes.map((mode) => (
                <button
                  className={`ai-mode-card ${activeMode === mode.key ? "active" : ""}`}
                  data-mode={mode.key}
                  key={mode.key}
                  type="button"
                  onClick={() => openFeature(mode.key)}
                >
                  <span aria-hidden="true">{mode.glyph}</span>
                  <strong>{mode.title}</strong>
                  <small>{mode.description}</small>
                </button>
              ))}
            </div>

            {!isSidePanelOpen && (uploadError || attachments.length > 0) && (
              <div className="assistant-file-tray" aria-live="polite">
                {uploadError && <p className="assistant-upload-error">{uploadError}</p>}
                {attachments.map((attachment) => (
                  <div className="assistant-file-card" key={attachment.id}>
                    <span>{attachment.file.name.split(".").pop()?.toUpperCase() ?? "FILE"}</span>
                    <div>
                      <strong>{attachment.file.name}</strong>
                      <small>{formatFileSize(attachment.file.size)} · {attachment.status}{attachment.progress > 0 && attachment.progress < 100 ? ` ${attachment.progress}%` : ""}</small>
                    </div>
                    <button type="button" onClick={() => removeAttachment(attachment.id)} aria-label={`删除${attachment.file.name}`}>
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="ai-composer">
              <button className="ai-attach-button" type="button" onClick={() => attachmentInputRef.current?.click()} aria-label="上传附件">
                <span aria-hidden="true" />
              </button>
              <input
                ref={attachmentInputRef}
                type="file"
                accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                hidden
                onChange={(event) => addFiles(event.target.files)}
              />
              <textarea
                ref={textareaRef}
                value={inputValue}
                rows={1}
                placeholder={composerPlaceholder}
                onChange={(event) => setInputValue(event.target.value)}
                onKeyDown={handleInputKeyDown}
              />
              <button className="ai-send-button" type="button" onClick={() => sendMessage()} disabled={isSending || (!inputValue.trim() && attachments.length === 0 && !jdValue.trim())} aria-label="发送消息">
                ↑
              </button>
            </div>
          </section>
        )}

        {isSidePanelOpen && (
          <TemplateRecommendationPanel
            sidePanelType={sidePanelType}
            templates={recommendedTemplates}
            selectedTemplate={selectedTemplate}
            resumeData={liveResumeData}
            uploadedResumes={uploadedResumes}
            jdValue={jdValue}
            setJdValue={setJdValue}
            optimizationPlan={optimizationPlan}
            optimizationError={optimizationError}
            jdImageInputRef={jdImageInputRef}
            jdImageStatus={jdImageStatus}
            onParseJdImage={handleJdImageFiles}
            isOptimizing={isGeneratingResume}
            isDragging={isDragging}
            onDragOver={handleDragOver}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            modeUploadInputRef={modeUploadInputRef}
            onAddFiles={addFiles}
            uploadError={uploadError}
            attachments={attachments}
            onRemoveAttachment={removeAttachment}
            sidePanelView={sidePanelView}
            notice={templateNotice}
            isGenerating={isGeneratingResume}
            onViewChange={setSidePanelView}
            onPreview={(template) => selectTemplate(template, "preview")}
            onUseTemplate={(template) => selectTemplate(template, "preview")}
            onClose={exitFeatureMode}
            onCollapse={collapseSidePanel}
            onBackToTemplates={() => setSidePanelView("recommendations")}
            onSaveDraft={saveResumeDraft}
            onGenerate={generateResume}
            navigateToMarket={navigateFromTemplatePanel}
            jobOptimizationContext={jobOptimizationContext}
            onStartJobOptimization={startJobOptimization}
            onSelectOptimizationResume={(resume) => {
              setJobOptimizationContext((current) => ({
                ...(current ?? {}),
                resumeId: resume.id,
                resumeName: resume.fileName,
              }));
              setOptimizationPlan(null);
              setOptimizationError("");
              setTemplateNotice(`已选择「${resume.fileName}」，点击“生成优化方案”后会重新调用共享大模型。`);
            }}
            resumeWizardStep={resumeWizardCurrentStep}
            resumeWizardStepIndex={resumeWizardStepIndex}
            resumeWizardTotal={resumeWizardSteps.length}
            resumeWizardCompletedCount={resumeWizardCompletedCount}
            resumeWizardComplete={resumeWizardComplete}
          />
        )}
      </div>
    </section>
  );
}

function TemplateRecommendationPanel({
  sidePanelType,
  templates,
  selectedTemplate,
  resumeData,
  uploadedResumes,
  jdValue,
  setJdValue,
  optimizationPlan,
  optimizationError,
  jdImageInputRef,
  jdImageStatus,
  onParseJdImage,
  isOptimizing,
  isDragging,
  onDragOver,
  onDragLeave,
  onDrop,
  modeUploadInputRef,
  onAddFiles,
  uploadError,
  attachments,
  onRemoveAttachment,
  sidePanelView,
  notice,
  isGenerating,
  onViewChange,
  onPreview,
  onUseTemplate,
  onClose,
  onCollapse,
  onBackToTemplates,
  onSaveDraft,
  onGenerate,
  navigateToMarket,
  jobOptimizationContext,
  onStartJobOptimization,
  onSelectOptimizationResume,
  resumeWizardStep,
  resumeWizardStepIndex,
  resumeWizardTotal,
  resumeWizardCompletedCount,
  resumeWizardComplete,
}) {
  const panelCopy = {
    generation: {
      title: "制作一份可保存的岗位化简历",
      description: "左侧回答常用简历问题，右侧预览会同步生成并保存在草稿中。",
      closeLabel: "关闭简历制作",
    },
    template: {
      title: "智能简历模板推荐",
      description: "根据你的求职方向、经历和内容特点，为你推荐更合适的简历模板。",
      closeLabel: "关闭模板推荐",
    },
    diagnosis: {
      title: "简历诊断工作区",
      description: "上传或选择一份简历，小律会从结构、表达、项目证据和岗位匹配度进行诊断。",
      closeLabel: "关闭简历诊断",
    },
    optimization: {
      title: "简历优化工作区",
      description: "选择简历并补充目标岗位与JD，用于生成优化前后对比和改写建议。",
      closeLabel: "关闭简历优化",
    },
  }[sidePanelType ?? "template"];

  return (
    <aside className={`template-side-panel ${sidePanelType ?? "template"}`} aria-label={panelCopy.title}>
      <div className="template-panel-head">
        <div>
          <h2>{panelCopy.title}</h2>
          <p>{panelCopy.description}</p>
        </div>
        <div className="template-panel-controls">
          <button type="button" onClick={onCollapse}>收起</button>
          <button type="button" onClick={onClose} aria-label={panelCopy.closeLabel}>×</button>
        </div>
      </div>

      {sidePanelType === "template" && (
        <div className="template-panel-tabs" role="tablist" aria-label="模板面板视图">
          <button className={sidePanelView === "recommendations" ? "active" : ""} type="button" onClick={() => onViewChange("recommendations")}>
            模板推荐
          </button>
          <button className={sidePanelView === "preview" ? "active" : ""} type="button" onClick={() => onViewChange("preview")}>
            简历预览
          </button>
        </div>
      )}

      <div className="template-panel-body">
        {sidePanelType === "generation" && (
          <div className="generation-workbench">
            <section className="generation-brief">
              <div>
                <span>AI辅助制作简历</span>
                <h3>{resumeWizardComplete ? "基础内容已补齐" : resumeWizardStep?.label ?? "继续补充内容"}</h3>
                <p>{resumeWizardComplete ? "你可以继续在左侧补充任意经历，右侧会继续实时更新。" : resumeWizardStep?.question}</p>
              </div>
              <div className="generation-progress">
                <strong>{Math.min(resumeWizardStepIndex + 1, resumeWizardTotal)} / {resumeWizardTotal}</strong>
                <small>{resumeWizardCompletedCount} 项已填</small>
              </div>
            </section>
            <ResumePreview resumeData={resumeData} template={selectedTemplate} />
          </div>
        )}

        {sidePanelType === "template" && (
          sidePanelView === "recommendations" ? (
            <div className="template-card-grid">
              {templates.map((template) => (
                <TemplateCard
                  key={template.id}
                  template={template}
                  selected={selectedTemplate.id === template.id}
                  onPreview={() => onPreview(template)}
                  onUse={() => onUseTemplate(template)}
                />
              ))}
            </div>
          ) : (
            <ResumePreview resumeData={resumeData} template={selectedTemplate} />
          )
        )}

        {sidePanelType === "diagnosis" && (
          <DiagnosisPanelContent
            uploadedResumes={uploadedResumes}
            isDragging={isDragging}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
            inputRef={modeUploadInputRef}
            onAddFiles={onAddFiles}
            uploadError={uploadError}
            attachments={attachments}
            onRemoveAttachment={onRemoveAttachment}
          />
        )}

        {sidePanelType === "optimization" && (
          <OptimizationPanelContent
            navigate={navigate}
            uploadedResumes={uploadedResumes}
            jdValue={jdValue}
            setJdValue={setJdValue}
            optimizationPlan={optimizationPlan}
            optimizationError={optimizationError}
            jdImageInputRef={jdImageInputRef}
            jdImageStatus={jdImageStatus}
            onParseJdImage={onParseJdImage}
            isOptimizing={isOptimizing}
            jobOptimizationContext={jobOptimizationContext}
            onStartJobOptimization={onStartJobOptimization}
            onSelectResume={onSelectOptimizationResume}
            isDragging={isDragging}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
            inputRef={modeUploadInputRef}
            onAddFiles={onAddFiles}
            uploadError={uploadError}
            attachments={attachments}
            onRemoveAttachment={onRemoveAttachment}
          />
        )}
      </div>

      <div className="template-panel-footer">
        <div className="template-panel-notice">
          {notice || (
            sidePanelType === "generation"
              ? "左侧回答时，右侧简历会实时同步；输入“跳过”可先跳到下一项。"
              : sidePanelType === "template"
                ? "左侧继续补充经历后，推荐排序和简历预览会自动更新。"
                : "优化会调用与聊天、诊断相同的后端大模型；生成后请逐项确认，不会自动覆盖原简历。"
          )}
        </div>
        <div className="template-market-links" aria-label="岗位入口">
          <button type="button" onClick={() => navigateToMarket?.("/campus")}>
            <span aria-hidden="true">校</span>
            <strong>校招岗位</strong>
            <small>发现应届生机会</small>
          </button>
          <button type="button" onClick={() => navigateToMarket?.("/internship")}>
            <span aria-hidden="true">习</span>
            <strong>实习岗位</strong>
            <small>寻找实践和转正机会</small>
          </button>
        </div>
        <div className="template-panel-actions">
          {sidePanelType === "template" && <button type="button" onClick={onBackToTemplates}>更换模板</button>}
          <button type="button" onClick={onSaveDraft}>保存草稿</button>
          <button className="primary" type="button" onClick={onGenerate} disabled={isGenerating}>
            {isGenerating
              ? "处理中"
              : sidePanelType === "generation"
                ? "重新开始"
                : sidePanelType === "template"
                  ? "生成简历"
                  : sidePanelType === "diagnosis"
                    ? "开始诊断"
                    : "生成优化方案"}
          </button>
          <button type="button" disabled title="接口尚未连接">{sidePanelType === "template" ? "下载简历" : "导出结果"}</button>
        </div>
      </div>
    </aside>
  );
}

function DiagnosisPanelContent({
  uploadedResumes,
  isDragging,
  onDragOver,
  onDragLeave,
  onDrop,
  inputRef,
  onAddFiles,
  uploadError,
  attachments,
  onRemoveAttachment,
  onExit,
}) {
  return (
    <div className="feature-panel-content">
      <ResumeFilePicker
        title="上传或选择简历"
        description="支持 PDF、DOC、DOCX。上传后会进入诊断队列。"
        isDragging={isDragging}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        inputRef={inputRef}
        onAddFiles={onAddFiles}
        uploadError={uploadError}
        attachments={attachments}
        onRemoveAttachment={onRemoveAttachment}
      />
      <section className="feature-info-card">
        <h3>诊断范围</h3>
        <ul>
          <li>简历结构、模块完整度和阅读顺序</li>
          <li>项目描述、成果量化和岗位证据</li>
          <li>求职方向、关键词和岗位匹配度</li>
        </ul>
      </section>
      <section className="feature-empty-result">
        <strong>诊断结果区域</strong>
        <p>尚未上传或选择简历。完成上传后，这里会展示评分、问题清单和修改建议。</p>
      </section>
      {uploadedResumes.length > 0 && (
        <section className="feature-info-card">
          <h3>已有简历</h3>
          <div className="feature-resume-list">
            {uploadedResumes.slice(0, 4).map((resume) => <span key={resume.id}>{resume.fileName}</span>)}
          </div>
        </section>
      )}
    </div>
  );
}

function ResumeOptimizationWorkspaceV2({
  navigate,
  uploadedResumes,
  jdValue,
  setJdValue,
  optimizationPlan,
  optimizationError,
  optimizationProgress,
  jdImageInputRef,
  jdImageStatus,
  onParseJdImage,
  isOptimizing,
  jobOptimizationContext,
  onStartJobOptimization,
  onUpdateOptimizationContext,
  onSaveOptimizedVersion,
  onDownloadOptimizedResume,
  onContinueDelivery,
  onSelectResume,
  isDragging,
  onDragOver,
  onDragLeave,
  onDrop,
  inputRef,
  onAddFiles,
  uploadError,
  attachments,
  onRemoveAttachment,
  onExit,
}) {
  const optimizationInputRef = useRef(null);
  const selectedResume = jobOptimizationContext?.resumeId
    ? uploadedResumes.find((resume) => String(resume.id) === String(jobOptimizationContext.resumeId))
    : null;
  const targetRole = jobOptimizationContext?.role && !String(jobOptimizationContext.role).includes("优化")
    ? jobOptimizationContext.role
    : "";
  const hasTarget = Boolean(targetRole.trim());
  const hasJd = Boolean(jdValue.trim());
  const activeStep = optimizationPlan || isOptimizing ? 3 : selectedResume && (hasTarget || hasJd) ? 2 : selectedResume ? 2 : 1;
  const tasks = optimizationPlan?.tasks ?? [];
  const highlights = tasks.slice(0, 3);
  const compareTasks = tasks.slice(0, 2);
  const scoreBase = hasTarget || hasJd ? 58 + Math.min(8, Math.max(0, tasks.length)) : 52 + Math.min(6, Math.max(0, tasks.length));
  const scoreAfter = optimizationPlan ? Math.min(92, scoreBase + Math.max(12, tasks.length * 4 + (optimizationPlan.keywords?.length ?? 0))) : null;
  const summaryTags = (optimizationPlan?.keywords?.length ? optimizationPlan.keywords : ["关键词覆盖", "成果量化", "项目表达", "ATS友好"]).slice(0, 6);
  const quickRoles = ["产品经理", "Java开发", "数据分析师", "运营专员", "后端开发"];
  const focusItems = [
    ["关键词覆盖", "提升岗位关键词命中率"],
    ["成果量化", "强化真实结果表达"],
    ["项目表达", "优化项目叙述逻辑"],
    ["ATS友好", "提升筛选通过率"],
  ];
  const loadingSteps = ["解析原始简历", "匹配目标岗位", "优化经历表达", "强化关键词覆盖", "生成优化版本"];

  function selectRole(role) {
    onUpdateOptimizationContext?.({ role });
  }

  function updateRole(value) {
    onUpdateOptimizationContext?.({ role: value });
  }

  return (
    <div className="resume-opt-v2">
      <header className="resume-opt-v2-head">
        <div>
          <h1>简历优化 <span>全新升级</span></h1>
          <p>AI深度优化简历，精准匹配目标岗位，提升面试邀约率</p>
        </div>
        {onExit && <button type="button" onClick={onExit}>退出优化</button>}
      </header>

      <div className="resume-opt-v2-grid">
        <aside className="resume-opt-v2-left">
          <section className="resume-opt-assistant">
            <div className="resume-opt-bot">律</div>
            <div>
              <strong>小律 · 简历优化助手</strong>
              <span>在线</span>
            </div>
          </section>

          <section className="resume-opt-v2-steps" aria-label="简历优化流程">
            {[
              ["选择简历", "上传或选择已有简历"],
              ["填写目标岗位", "明确投递方向与岗位需求"],
              ["一键优化并下载", "AI智能优化生成更匹配简历"],
            ].map(([title, desc], index) => (
              <div className={activeStep >= index + 1 ? "active" : ""} key={title}>
                <i>{index + 1}</i>
                <strong>{title}</strong>
                <span>{desc}</span>
              </div>
            ))}
          </section>

          <section className="resume-opt-card resume-opt-role-card">
            <h3>想投什么岗位？</h3>
            <input
              className="resume-opt-role-input"
              value={targetRole}
              onChange={(event) => updateRole(event.target.value)}
              placeholder="请输入目标岗位，例如：产品经理、Java开发、数据分析师"
            />
            <div className="resume-opt-tags">
              {quickRoles.map((role) => <button type="button" key={role} onClick={() => selectRole(role)}>{role}</button>)}
            </div>
          </section>

          <section className="resume-opt-inputs" aria-label="简历和岗位JD">
            <div className="resume-opt-input-grid">
              <section className="resume-opt-input-box resume-opt-upload-box">
                <h3>{selectedResume ? "已选择简历" : "上传或选择简历"}</h3>
                {selectedResume ? (
                  <div className="resume-opt-selected">
                    <span>{selectedResume.fileType || "RES"}</span>
                    <div>
                      <strong>{selectedResume.fileName}</strong>
                      <small>上传于 {selectedResume.uploadedAt ? new Date(selectedResume.uploadedAt).toLocaleDateString("zh-CN") : "当前会话"} · {formatFileSize(selectedResume.fileSize ?? 0)}</small>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        if (optimizationInputRef.current) optimizationInputRef.current.value = "";
                        optimizationInputRef.current?.click();
                      }}
                    >更换简历</button>
                  </div>
                ) : (
                  <ResumeFilePicker
                    title="上传本地简历"
                    description="支持 PDF、DOC、DOCX。上传后将用于真实AI优化。"
                    isDragging={isDragging}
                    onDragOver={onDragOver}
                    onDragLeave={onDragLeave}
                    onDrop={onDrop}
                    inputRef={inputRef}
                    onAddFiles={onAddFiles}
                    uploadError={uploadError}
                    attachments={attachments}
                    onRemoveAttachment={onRemoveAttachment}
                  />
                )}
                <input
                  ref={optimizationInputRef}
                  type="file"
                  accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  hidden
                  onChange={(event) => onAddFiles?.(event.target.files)}
                />
                {false && !selectedResume && uploadedResumes.length > 0 && (
                  <div className="resume-opt-existing">
                    <span>从已有简历中选择</span>
                    {uploadedResumes.slice(0, 3).map((resume) => (
                      <button type="button" key={resume.id} onClick={() => onSelectResume?.(resume)}>{resume.fileName}</button>
                    ))}
                  </div>
                )}
                {uploadError && <p className="resume-opt-error">{uploadError}</p>}
              </section>

              <label className="resume-opt-input-box resume-opt-jd resume-opt-jd-box">
                <strong>粘贴岗位JD（必选）</strong>
                <textarea
                  value={jdValue}
                  onChange={(event) => setJdValue(event.target.value)}
                  placeholder="将职位描述复制到这里，粘贴JD文字"
                />
              </label>
            </div>

            <button className="resume-opt-primary" type="button" onClick={onStartJobOptimization} disabled={!selectedResume || isOptimizing}>
              {isOptimizing ? "AI优化中..." : optimizationPlan ? "重新优化" : "一键优化简历"}
            </button>
            <p className="resume-opt-note">AI将基于你的简历和岗位需求，生成更具竞争力的优化版本</p>
          </section>

          <section className="resume-opt-focus">
            <h3>优化重点</h3>
            <div>
              {focusItems.map(([title, desc]) => (
                <article key={title}>
                  <strong>{title}</strong>
                  <span>{desc}</span>
                </article>
              ))}
            </div>
          </section>
        </aside>

        <main className="resume-opt-v2-right">
          {!isOptimizing && !optimizationPlan && (
            <section className="resume-opt-preview">
              <header>
                <h2>优化结果预览</h2>
                <span>示例效果</span>
              </header>
              <p>选择简历并填写目标岗位后，AI会从以下方面优化你的简历：</p>
              <div className="resume-opt-preview-points">
                {["精准匹配岗位需求", "强化成果量化表达", "优化结构与表达", "提升ATS友好度"].map((item) => <div key={item}>{item}</div>)}
              </div>
              <small>不会提前展示假评分，也不会编造经历、数字或项目成果。</small>
              {optimizationError && <p className="resume-opt-error">{optimizationError}</p>}
            </section>
          )}

          {isOptimizing && (
            <section className="resume-opt-loading" aria-live="polite">
              <h2>AI正在优化你的简历</h2>
              <strong>{optimizationProgress?.percent ?? 18}%</strong>
              <div className="resume-opt-progress"><i style={{ width: `${optimizationProgress?.percent ?? 18}%` }} /></div>
              <div className="resume-opt-loading-steps">
                {loadingSteps.map((step, index) => (
                  <div className={index < (optimizationProgress?.stage ?? 0) ? "done" : index === (optimizationProgress?.stage ?? 0) ? "active" : ""} key={step}>
                    <i>{index < (optimizationProgress?.stage ?? 0) ? "?" : index + 1}</i>
                    <span>{step}</span>
                  </div>
                ))}
              </div>
              <p>优化过程中不会编造你的经历与结果数据。AI真实结果返回并解析完成后才会进入100%。</p>
            </section>
          )}

          {!isOptimizing && optimizationPlan && (
            <section className="resume-opt-result">
              <header className="resume-opt-result-head">
                <h2>优化结果预览</h2>
                <button type="button" onClick={onStartJobOptimization}>重新优化</button>
              </header>

              <section className="resume-opt-score-card">
                <div>
                  <span>{hasTarget || hasJd ? "匹配度提升" : "简历竞争力提升"}</span>
                  <strong>{scoreBase}{hasTarget || hasJd ? "%" : ""} <b>→</b> {scoreAfter}{hasTarget || hasJd ? "%" : ""}</strong>
                  <p>根据本次真实AI返回的优化任务、关键词覆盖与目标岗位信息估算。</p>
                </div>
                <div>
                  <h3>优化亮点</h3>
                  {(highlights.length ? highlights : [
                    { section: "精准匹配岗位需求", reason: "围绕目标岗位调整表达重点。" },
                    { section: "成果量化增强", reason: "提示补充真实可核验的数据。" },
                    { section: "结构与表达优化", reason: "提高可读性和专业度。" },
                  ]).map((item) => (
                    <article key={item.id ?? item.section}>
                      <strong>{item.section}</strong>
                      <span>{item.reason}</span>
                    </article>
                  ))}
                </div>
              </section>

              <section className="resume-opt-compare">
                <h3>优化前 VS 优化后</h3>
                {(compareTasks.length ? compareTasks : tasks.slice(0, 1)).map((task) => (
                  <div className="resume-opt-compare-row" key={task.id ?? task.section}>
                    <article>
                      <span>优化前（原始简历片段）</span>
                      <strong>{task.section}</strong>
                      <p>{task.before}</p>
                    </article>
                    <i>VS</i>
                    <article className="after">
                      <span>优化后（AI优化后片段）</span>
                      <strong>{task.section}</strong>
                      <p>{task.after}</p>
                    </article>
                  </div>
                ))}
              </section>

              <section className="resume-opt-summary-card">
                <h3>优化后简历摘要</h3>
                <div className="resume-opt-profile">
                  <span>候选人</span>
                  <div>
                    <strong>{optimizationPlan.resumeName ?? selectedResume?.fileName ?? "当前简历"}</strong>
                    <small>{targetRole || optimizationPlan.targetRole || "目标岗位待补充"}</small>
                  </div>
                </div>
                <div className="resume-opt-summary-tags">
                  {summaryTags.map((tag) => <span key={tag}>{tag}</span>)}
                </div>
                <p>{optimizationPlan.summary ?? "AI已基于真实简历内容生成优化摘要，请逐项确认后保存为新版本。"}</p>
              </section>
            </section>
          )}
        </main>
      </div>
    </div>
  );
}

function OptimizationPanelContent({
  navigate,
  uploadedResumes,
  jdValue,
  setJdValue,
  optimizationPlan,
  optimizationError,
  optimizationProgress,
  jdImageInputRef,
  jdImageStatus,
  onParseJdImage,
  isOptimizing,
  jobOptimizationContext,
  onStartJobOptimization,
  onUpdateOptimizationContext,
  onSaveOptimizedVersion,
  onDownloadOptimizedResume,
  onContinueDelivery,
  onSelectResume,
  isDragging,
  onDragOver,
  onDragLeave,
  onDrop,
  inputRef,
  onAddFiles,
  uploadError,
  attachments,
  onRemoveAttachment,
  onExit,
}) {
  return (
    <ResumeOptimizationWorkspaceV2
      navigate={navigate}
      uploadedResumes={uploadedResumes}
      jdValue={jdValue}
      setJdValue={setJdValue}
      optimizationPlan={optimizationPlan}
      optimizationError={optimizationError}
      optimizationProgress={optimizationProgress}
      jdImageInputRef={jdImageInputRef}
      jdImageStatus={jdImageStatus}
      onParseJdImage={onParseJdImage}
      isOptimizing={isOptimizing}
      jobOptimizationContext={jobOptimizationContext}
      onStartJobOptimization={onStartJobOptimization}
      onUpdateOptimizationContext={onUpdateOptimizationContext}
      onSaveOptimizedVersion={onSaveOptimizedVersion}
      onDownloadOptimizedResume={onDownloadOptimizedResume}
      onContinueDelivery={onContinueDelivery}
      onSelectResume={onSelectResume}
      isDragging={isDragging}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      inputRef={inputRef}
      onAddFiles={onAddFiles}
      uploadError={uploadError}
      attachments={attachments}
      onRemoveAttachment={onRemoveAttachment}
      onExit={onExit}
    />
  );

  const isDiagnosisOptimization = Boolean(jobOptimizationContext?.diagnosisId || jobOptimizationContext?.sourceLabel === "简历诊断报告");
  const contextTitle = isDiagnosisOptimization
    ? "诊断报告 · 按问题优先级优化"
    : `${jobOptimizationContext?.company ?? "目标公司"} · ${jobOptimizationContext?.role ?? "目标岗位"}`;
  const selectedResumeName = jobOptimizationContext?.resumeName ?? uploadedResumes[0]?.fileName ?? "未选择简历";
  const taskCount = optimizationPlan?.tasks?.length ?? 0;
  const highPriorityCount = optimizationPlan?.tasks?.filter((task) => {
    const priority = String(task.priority);
    return priority.toUpperCase().includes("HIGH") || priority.includes("高") || priority.includes("立即");
  })?.length ?? 0;
  const keywordCount = optimizationPlan?.keywords?.length ?? 0;
  const topTasks = optimizationPlan?.tasks?.slice(0, 3) ?? [];
  const taskWarnings = optimizationPlan?.warnings?.length ? optimizationPlan.warnings : ["不会自动覆盖原简历", "所有数字和成果都需确认"];
  const summaryPoints = optimizationPlan?.summaryPoints?.length ? optimizationPlan.summaryPoints : [];
  const optimizationChecks = [
    "求职方向和简历定位",
    "项目/工作经历表达",
    "成果证据和量化程度",
    "岗位关键词覆盖",
    "优化前后改写建议",
    "手动确认与不虚构原则",
  ];
  const optimizationLoadingSteps = [
    "读取当前简历和诊断上下文",
    "定位最高优先级问题",
    "生成逐项优化建议",
    "整理原文、建议写法和完成标准",
  ];

  return (
    <div className="optimization-workbench">
      <aside className="optimization-left">
        <header className="optimization-assistant-head">
          <div className="optimization-assistant-mark">律</div>
          <div>
            <strong>小律 · 简历优化助手</strong>
            <small>选择简历并补充目标岗位后，在本页生成优化报告</small>
          </div>
          <BackStepButton navigate={navigate} />
          {onExit && (
            <button className="optimization-exit-button" type="button" onClick={onExit}>
              退出优化
            </button>
          )}
        </header>

        <div className="optimization-left-scroll">
          <section className="optimization-card">
            <div className="optimization-section-title">
              <span>01</span>
              <div>
                <h3>选择简历</h3>
                <p>选择已有简历，或上传 PDF、DOC、DOCX 文件。</p>
              </div>
            </div>
            <ResumeFilePicker
              title="上传新简历"
              description="后端会解析简历正文，再交给 AI 生成结构化优化方案。"
              isDragging={isDragging}
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onDrop={onDrop}
              inputRef={inputRef}
              onAddFiles={onAddFiles}
              uploadError={uploadError}
              attachments={attachments}
              onRemoveAttachment={onRemoveAttachment}
            />
            <div className="optimization-resume-list" aria-label="已有简历">
              {uploadedResumes.length > 0
                ? uploadedResumes.slice(0, 4).map((resume) => (
                  <button
                    key={resume.id}
                    type="button"
                    className={String(resume.id) === String(jobOptimizationContext?.resumeId) ? "selected" : ""}
                    onClick={() => onSelectResume?.(resume)}
                  >
                    <strong>{resume.fileName}</strong>
                    <span>{resume.fileType} · {formatFileSize(resume.fileSize ?? 0)}</span>
                    <small>{resume.textLength ? `已解析 ${resume.textLength} 字符` : "等待解析"}</small>
                  </button>
                ))
                : <p className="optimization-muted">暂无已上传简历，可先上传新简历。</p>}
            </div>
          </section>

          <section className="optimization-card">
            <div className="optimization-section-title">
              <span>02</span>
              <div>
                <h3>目标岗位与 JD</h3>
                <p>可补充目标岗位或 JD，让优化方案更贴合投递方向。</p>
              </div>
            </div>
            <section className="assistant-jd-panel side optimization-jd-compact">
              <div className="optimization-jd-head">
                <div>
                  <strong>目标岗位与 JD</strong>
                  <small>{isDiagnosisOptimization ? "当前已载入诊断上下文，可结合目标岗位继续优化。" : "没有目标岗位时，可先填 JD 再生成优化方案。"}</small>
                </div>
                <input
                  ref={jdImageInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif,image/bmp"
                  hidden
                  onChange={(event) => onParseJdImage?.(event.target.files)}
                />
                <button
                  className="optimization-jd-image-button"
                  type="button"
                  disabled={jdImageStatus?.state === "loading"}
                  onClick={() => jdImageInputRef?.current?.click()}
                >
                  {jdImageStatus?.state === "loading" ? "识别中" : "插入JD图片"}
                </button>
              </div>
              <textarea
                id="optimization-jd-input"
                value={jdValue}
                onChange={(event) => setJdValue(event.target.value)}
                placeholder="例如：产品经理校招生，负责用户增长、数据分析、跨部门协作……"
              />
              {jdImageStatus?.message ? (
                <p className={`optimization-jd-image-status is-${jdImageStatus.state}`}>{jdImageStatus.message}</p>
              ) : null}
            </section>
            <div className="optimization-action-row optimization-generate-row">
              <button className={`primary ${isOptimizing ? "is-cancel" : ""}`} type="button" onClick={onStartJobOptimization}>
                {isOptimizing ? "取消生成" : optimizationPlan ? "重新生成方案" : "生成优化方案"}
              </button>
            </div>
          </section>

        </div>
      </aside>

      <main className="optimization-right">
        <div className="optimization-report-scroll">
          {isOptimizing ? (
            <section className="optimization-generating-panel" aria-live="polite">
              <div className="optimization-generating-orbit" aria-hidden="true">
                <span />
                <i />
              </div>
              <div>
                <span className="optimization-kicker">Generating Plan</span>
                <h1>正在生成优化方案</h1>
                <p>小律正在调用与聊天、诊断共用的后端大模型，根据当前简历、诊断报告和目标岗位整理真实优化建议。</p>
              </div>
              <div className="optimization-generating-steps">
                {optimizationLoadingSteps.map((item, index) => (
                  <div key={item} className={index < 2 ? "done" : index === 2 ? "active" : ""}>
                    <i>{index + 1}</i>
                    <span>{item}</span>
                  </div>
                ))}
              </div>
              <p className="optimization-muted">生成期间请不要重复点击。完成后右侧会自动切换为优化工作区，不会自动覆盖原简历。</p>
            </section>
          ) : !optimizationPlan ? (
            <section className="optimization-ready-panel">
              <div>
                <span className="optimization-kicker">AI Resume Optimization</span>
                <h1>简历优化工作区</h1>
                <p>上传或选择一份简历，小律会结合诊断报告、目标岗位和简历正文，生成可确认的优化报告。</p>
              </div>
              <div className="optimization-ready-grid">
                {optimizationChecks.map((item) => <div key={item}>{item}</div>)}
              </div>
              <p className="optimization-muted">右侧不会在生成前显示随机优化结论或虚假报告。</p>
            </section>
          ) : (
            <section className="optimization-report-panel">
              <header className="optimization-report-header">
                <div>
                  <span>{optimizationPlan.source === "remote" ? "AI优化报告" : "本地预览报告"}</span>
                  <h3>{optimizationPlan.title}</h3>
                  <p>{optimizationPlan.subtitle}</p>
                </div>
                {summaryPoints.length > 0 && (
                  <ul className="optimization-summary-points">
                    {summaryPoints.map((point) => <li key={point}>{point}</li>)}
                  </ul>
                )}
              </header>

              <section className="optimization-context-strip">
                <div>
                  <span>当前简历</span>
                  <strong>{selectedResumeName}</strong>
                </div>
                <div>
                  <span>优化来源</span>
                  <strong>{jobOptimizationContext?.sourceLabel ?? (isDiagnosisOptimization ? "简历诊断报告" : "手动输入")}</strong>
                </div>
                <div>
                  <span>目标方向</span>
                  <strong>{contextTitle}</strong>
                </div>
              </section>

              <section className="optimization-state-row">
                <span>{optimizationPlan?.modelShared ? "与聊天/诊断共用同一模型" : "本地预览"}</span>
                <span>{optimizationPlan?.modelSource ?? "openai-compatible-shared-model"}</span>
                <span>{optimizationPlan?.generatedAt ? new Date(optimizationPlan.generatedAt).toLocaleString() : "等待生成"}</span>
                <span>{optimizationPlan?.disclaimer ?? "AI辅助优化建议需要用户确认"}</span>
              </section>

              <section className="optimization-stat-grid">
                <div><span>优化任务</span><strong>{taskCount || "待生成"}</strong></div>
                <div><span>高优先级</span><strong>{optimizationPlan ? highPriorityCount : "待评估"}</strong></div>
                <div><span>岗位关键词</span><strong>{optimizationPlan ? keywordCount : "待提取"}</strong></div>
                <div><span>覆盖方式</span><strong>手动确认</strong></div>
              </section>

              <section className="optimization-advice-card">
                <div className="optimization-section-head">
                  <div>
                    <span>Priority Advice</span>
                    <h3>优先优化建议</h3>
                  </div>
                  <small>{`${taskCount} 项待确认`}</small>
                </div>
                <div className="optimization-advice-list">
                  {topTasks.map((task) => (
                    <article key={task.id}>
                      <span>{task.priority}</span>
                      <h4>{task.section}</h4>
                      <p>{task.reason}</p>
                      <small>证据：{task.evidence}</small>
                    </article>
                  ))}
                </div>
              </section>

              <section className="feature-compare-grid optimization-compare-grid">
                <div>
                  <h3>优化前问题</h3>
                  <ul className="optimization-brief-list">
                    {optimizationPlan.tasks.slice(0, 4).map((task) => (
                      <li key={task.id}>
                        <strong>{task.section}</strong>
                        <span>{task.before}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h3>建议改写方向</h3>
                  <ul className="optimization-brief-list positive">
                    {optimizationPlan.tasks.slice(0, 4).map((task) => (
                      <li key={task.id}>
                        <strong>{task.section}</strong>
                        <span>{task.after}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </section>

              <section className="optimization-plan-card optimization-plan-focus">
                <div className="optimization-plan-head">
                  <span>{optimizationPlan.source === "remote" ? "AI优化方案" : "本地预览方案"}</span>
                  <h3>{optimizationPlan.title}</h3>
                  <p>{optimizationPlan.subtitle}</p>
                </div>
                <div className="optimization-keywords">
                  {(optimizationPlan.keywords?.length ? optimizationPlan.keywords : ["岗位关键词待补充"]).map((keyword) => (
                    <span key={keyword}>{keyword}</span>
                  ))}
                </div>
                <ul className="optimization-summary-list">
                  {optimizationPlan.summary.map((item) => <li key={item}>{item}</li>)}
                </ul>
                <div className="optimization-warning-strip">
                  {taskWarnings.map((warning) => <span key={warning}>{warning}</span>)}
                </div>
                <div className="optimization-task-list optimization-task-focus-list">
                  {optimizationPlan.tasks.map((task) => (
                    <article key={task.id} className="optimization-task-card">
                      <div>
                        <span>{task.priority}</span>
                        <h4>{task.section}</h4>
                      </div>
                      <dl>
                        <dt>当前问题</dt>
                        <dd>{task.before}</dd>
                        <dt>建议改法</dt>
                        <dd>{task.after}</dd>
                        <dt>为什么这样改</dt>
                        <dd>{task.reason}</dd>
                        <dt>参考证据</dt>
                        <dd>{task.evidence}</dd>
                        <dt>完成标准</dt>
                        <dd>{task.acceptanceCriteria}</dd>
                      </dl>
                      <button type="button">确认后手动修改</button>
                    </article>
                  ))}
                </div>
              </section>
            </section>
          )}
        </div>
      </main>
    </div>
  );
}
function ResumeFilePicker({
  title,
  description,
  isDragging,
  onDragOver,
  onDragLeave,
  onDrop,
  inputRef,
  onAddFiles,
  uploadError,
  attachments,
  onRemoveAttachment,
}) {
  return (
    <section className="feature-file-picker">
      <div
        className={`assistant-upload-zone ${isDragging ? "dragging" : ""}`}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") inputRef.current?.click();
        }}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          hidden
          onChange={(event) => onAddFiles(event.target.files)}
        />
        <span className="assistant-upload-icon" aria-hidden="true" />
        <b>{title}</b>
        <small>{description}</small>
      </div>
      {(uploadError || attachments.length > 0) && (
        <div className="assistant-file-tray" aria-live="polite">
          {uploadError && <p className="assistant-upload-error">{uploadError}</p>}
          {attachments.map((attachment) => (
            <div className="assistant-file-card" key={attachment.id}>
              <span>{attachment.file.name.split(".").pop()?.toUpperCase() ?? "FILE"}</span>
              <div>
                <strong>{attachment.file.name}</strong>
                <small>{formatFileSize(attachment.file.size)} · {attachment.status}{attachment.progress > 0 && attachment.progress < 100 ? ` ${attachment.progress}%` : ""}</small>
              </div>
              <button type="button" onClick={() => onRemoveAttachment(attachment.id)} aria-label={`删除${attachment.file.name}`}>
                ×
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function TemplateCard({ template, selected, onPreview, onUse }) {
  return (
    <article className={`template-card ${selected ? "selected" : ""}`}>
      {selected && <span className="template-selected-badge">当前使用</span>}
      <ResumeTemplateThumbnail tone={template.tone} />
      <div className="template-card-copy">
        <div>
          <h3>{template.name}</h3>
          <strong>{template.badge ?? `${template.score}%`}</strong>
        </div>
        <p>适合：{template.audience}</p>
        <p>特点：{template.highlight}</p>
        <div className="template-tags">
          {template.tags.map((tag) => <span key={tag}>{tag}</span>)}
        </div>
        <small>推荐理由：{template.reason}</small>
      </div>
      <div className="template-card-actions">
        <button type="button" onClick={onPreview}>预览</button>
        <button type="button" onClick={onUse}>{selected ? "当前使用" : "使用此模板"}</button>
      </div>
    </article>
  );
}

function ResumeTemplateThumbnail({ tone }) {
  return (
    <div className={`template-thumb ${tone}`} aria-hidden="true">
      <div className="thumb-header">
        <span />
        <i />
      </div>
      <div className="thumb-section wide" />
      <div className="thumb-grid">
        <span />
        <span />
      </div>
      <div className="thumb-section" />
      <div className="thumb-lines">
        <span />
        <span />
        <span />
      </div>
    </div>
  );
}

function ResumePreview({ resumeData, template }) {
  const basic = resumeData.basicInfo ?? {};
  const placeholder = (text) => <span className="resume-placeholder">{text}</span>;
  const isSocial = template?.tone === "social";
  const sections = isSocial ? [
    { title: "个人优势", hint: "用3-5条说明工作年限、行业沉淀、业务方法、协作能力和可验证成果。", value: resumeData.summary, fallback: "等待你补充个人优势" },
    { title: "核心技能", hint: "突出电商运营、数字化营销、活动策划、投放工具、数据分析、用户增长等岗位关键词。", value: resumeData.skills, fallback: "等待你补充核心技能" },
    { title: "工作经历", hint: "按时间倒序展示公司、岗位、负责业务、关键动作和业务结果。", value: resumeData.experience, fallback: "等待你补充工作经历" },
    { title: "项目案例", hint: "承接运营活动、营销项目、店铺增长、渠道投放、私域转化等代表案例。", value: resumeData.projects, fallback: "等待你补充项目案例" },
    { title: "教育背景", hint: "展示最高学历、专业、院校和与岗位有关的进修背景。", value: resumeData.education, fallback: "等待你补充教育背景" },
    { title: "证书荣誉", hint: "保留与运营、营销、语言、数据工具或行业资格相关的证书、奖项和作品链接。", value: resumeData.campusExperience, fallback: "等待你补充证书荣誉" },
  ] : [
    { title: "核心能力", hint: "概括与目标岗位相关的3-5项能力，尽量对应课程、实习、项目或证书证据。", value: resumeData.skills, fallback: "等待你补充核心能力" },
    { title: "教育背景", hint: "突出学校、专业、学历、时间、主修课程、成绩和校园经历。", value: resumeData.education, fallback: "等待你补充教育背景" },
    { title: "实习经历", hint: "按单位、岗位、时间、职责、行动和可验证成果展开。", value: resumeData.experience, fallback: "等待你补充实习经历" },
    { title: "项目经历", hint: "说明项目背景、个人角色、使用方法或工具、关键动作和最终结果。", value: resumeData.projects, fallback: "等待你补充项目经历" },
    { title: "校园经历", hint: "展示学生组织、社团、竞赛、志愿服务或校园活动中的职责和成果。", value: resumeData.campusExperience, fallback: "等待你补充校园经历" },
    { title: "个人总结", hint: "围绕目标岗位、优势证据和求职动机收束表达。", value: resumeData.summary, fallback: "等待你补充个人总结" },
  ];

  return (
    <div className="resume-preview-stage">
      <article className={`resume-paper ${template.tone}`}>
        <header className="resume-paper-header">
          <div>
            <h2>{basic.name || "姓名"}</h2>
            <p>{resumeData.jobTarget || (isSocial ? "目标职位" : "求职意向")}</p>
          </div>
          <ul>
            <li>{basic.phone || "手机号"}</li>
            <li>{basic.email || "邮箱"}</li>
            <li>{basic.location || "城市"}</li>
          </ul>
        </header>

        {sections.map((section) => (
          <ResumePreviewSection
            key={section.title}
            title={section.title}
            hint={section.hint}
            value={section.value}
            fallback={placeholder(section.fallback)}
          />
        ))}
      </article>
    </div>
  );
}

function ResumePreviewSection({ title, hint, value, fallback }) {
  const lines = value ? value.split("\n").filter(Boolean) : [];
  return (
    <section className="resume-paper-section">
      <h3>{title}</h3>
      {hint && <p className="resume-paper-section-hint">{hint}</p>}
      {lines.length > 0 ? (
        <ul>
          {lines.map((line) => <li key={line}>{line}</li>)}
        </ul>
      ) : fallback}
    </section>
  );
}
function ApplicationMovedCard({ stats, navigate }) {
  const stageSummary = STAGES.map((stage) => `${stats[stage.key]}个${stage.label}`).join(" · ");

  return (
    <section className="application-moved-card" aria-label="投递记录入口">
      <div>
        <span className="panel-tag">投递管理</span>
        <h2>投递记录已移至个人中心</h2>
        <p>前往个人中心，统一管理岗位状态、简历绑定、笔试和面试进度。</p>
        <small>共{stats.all}个岗位 · {stageSummary}</small>
      </div>
      <button className="primary-action add-job-button" type="button" onClick={() => navigate(`${routePathByKey.profile}?section=applications`)}>
        管理投递记录 →
      </button>
    </section>
  );
}

function useApplicationStats(jobs) {
  return useMemo(() => {
    const result = { all: jobs.length };
    STAGES.forEach((stage) => {
      result[stage.key] = jobs.filter((job) => job.stage === stage.key).length;
    });
    return result;
  }, [jobs]);
}

function ApplicationTrackerManagement() {
  const [jobs, setJobs] = useState(loadStoredJobs);
  const [query, setQuery] = useState("");
  const [quickFilter, setQuickFilter] = useState("all");
  const [stageFilter, setStageFilter] = useState("all");
  const [viewMode, setViewMode] = useState("cards");
  const [drawerMode, setDrawerMode] = useState(null);
  const [editingJob, setEditingJob] = useState(null);
  const [detailJobId, setDetailJobId] = useState(null);
  const [detailClosing, setDetailClosing] = useState(false);
  const [deleteJob, setDeleteJob] = useState(null);
  const [formError, setFormError] = useState("");
  const [form, setForm] = useState(EMPTY_JOB_FORM);
  const detailCloseTimer = useRef(0);

  useEffect(() => {
    saveStoredJobs(jobs);
  }, [jobs]);

  useEffect(() => {
    if (drawerMode !== "form") return undefined;
    document.body.classList.add("app-drawer-open");
    return () => {
      document.body.classList.remove("app-drawer-open");
    };
  }, [drawerMode]);

  useEffect(() => {
    if (!detailJobId) return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.body.classList.add("job-detail-open");

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        closeJobDetails();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      document.body.classList.remove("job-detail-open");
      window.clearTimeout(detailCloseTimer.current);
    };
  }, [detailJobId]);

  const stats = useApplicationStats(jobs);

  const filteredJobs = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    return jobs.filter((job) => {
      const timeStatus = getTimeStatus(job);
      const haystack = [
        job.company,
        job.role,
        job.city,
        job.resume,
        job.notes,
        job.jd,
        job.link,
        ...(job.tags ?? []),
      ].join(" ").toLowerCase();

      const matchesSearch = !keyword || haystack.includes(keyword);
      const matchesStage = stageFilter === "all" || job.stage === stageFilter;
      const matchesQuick =
        quickFilter === "all" ||
        (quickFilter === "favorite" && job.favorite) ||
        (quickFilter === "urgent" && timeStatus === "urgent") ||
        (quickFilter === "high" && Number(job.aiScore) >= 85) ||
        (quickFilter === "bound" && Boolean(job.resume)) ||
        (quickFilter === "noTime" && !job.deadline && !job.eventTime);

      return matchesSearch && matchesStage && matchesQuick;
    });
  }, [jobs, query, quickFilter, stageFilter]);

  const detailJob = jobs.find((job) => job.id === detailJobId) ?? null;

  function openAddJob(stage = "pending") {
    setForm({ ...EMPTY_JOB_FORM, stage });
    setEditingJob(null);
    setFormError("");
    setDrawerMode("form");
  }

  function openEditJob(job) {
    setEditingJob(job);
    setForm(jobToForm(job));
    setFormError("");
    setDrawerMode("form");
  }

  function openJobDetails(job) {
    window.clearTimeout(detailCloseTimer.current);
    setDetailClosing(false);
    setDetailJobId(job.id);
  }

  function closeJobDetails() {
    if (!detailJobId || detailClosing) return;
    setDetailClosing(true);
    window.clearTimeout(detailCloseTimer.current);
    detailCloseTimer.current = window.setTimeout(() => {
      setDetailJobId(null);
      setDetailClosing(false);
    }, 260);
  }

  function editFromDetails(job) {
    window.clearTimeout(detailCloseTimer.current);
    setDetailJobId(null);
    setDetailClosing(false);
    openEditJob(job);
  }

  function saveJob(event) {
    event.preventDefault();
    const trimmedCompany = form.company.trim();
    const trimmedRole = form.role.trim();
    const trimmedCity = form.city.trim();

    if (!trimmedCompany || !trimmedRole || !trimmedCity) {
      setFormError("请填写公司名称、岗位名称和城市。");
      return;
    }

    const payload = formToJob(form, editingJob);
    setJobs((current) => {
      if (editingJob) {
        return current.map((job) => (job.id === editingJob.id ? payload : job));
      }
      return [payload, ...current];
    });
    setDrawerMode(null);
    setEditingJob(null);
    setForm(EMPTY_JOB_FORM);
  }

  function confirmDelete(job) {
    setDeleteJob(job);
  }

  function removeJob(jobId) {
    setJobs((current) => current.filter((job) => job.id !== jobId));
    if (detailJobId === jobId) setDetailJobId(null);
    setDeleteJob(null);
  }

  function updateJob(jobId, patch) {
    setJobs((current) => current.map((job) => (job.id === jobId ? { ...job, ...patch } : job)));
  }

  return (
    <section id="applications" className="profile-applications-panel" aria-label="投递管理">
      <div className="profile-applications-heading">
        <div>
          <span className="panel-tag">Application Tracker</span>
          <h2>我的投递管理</h2>
        </div>
        <button className="primary-action add-job-button" type="button" onClick={() => openAddJob()}>
          <span>＋</span>
          添加岗位
        </button>
      </div>

      <StatsOverview stats={stats} stageFilter={stageFilter} setStageFilter={setStageFilter} />

      <TrackerToolbar
        query={query}
        setQuery={setQuery}
        quickFilter={quickFilter}
        setQuickFilter={setQuickFilter}
        visibleCount={filteredJobs.length}
        totalCount={jobs.length}
        viewMode={viewMode}
        setViewMode={setViewMode}
      />

      {filteredJobs.length === 0 ? (
        <EmptyState clearFilters={() => { setQuery(""); setQuickFilter("all"); setStageFilter("all"); }} />
      ) : viewMode === "cards" ? (
        <KanbanBoard
          jobs={filteredJobs}
          stats={stats}
          updateJob={updateJob}
          openAddJob={openAddJob}
          openEditJob={openEditJob}
          openDetail={openJobDetails}
          confirmDelete={confirmDelete}
        />
      ) : (
        <JobsTable
          jobs={filteredJobs}
          updateJob={updateJob}
          openEditJob={openEditJob}
          openDetail={openJobDetails}
          confirmDelete={confirmDelete}
        />
      )}

      {drawerMode === "form" && (
        <JobFormDrawer
          form={form}
          setForm={setForm}
          error={formError}
          editingJob={editingJob}
          onSubmit={saveJob}
          onCancel={() => { setDrawerMode(null); setEditingJob(null); setFormError(""); }}
        />
      )}

      {detailJob && (
        <JobDetailDrawer
          job={detailJob}
          closing={detailClosing}
          updateJob={updateJob}
          onClose={closeJobDetails}
          onEdit={() => editFromDetails(detailJob)}
          onDelete={() => confirmDelete(detailJob)}
        />
      )}

      {deleteJob && (
        <ConfirmDialog
          job={deleteJob}
          onCancel={() => setDeleteJob(null)}
          onConfirm={() => removeJob(deleteJob.id)}
        />
      )}
    </section>
  );
}

function StatsOverview({ stats, stageFilter, setStageFilter }) {
  const cards = [
    { key: "all", label: "全部岗位", value: stats.all },
    ...STAGES.map((stage) => ({ key: stage.key, label: stage.label, value: stats[stage.key] })),
  ];

  return (
    <div className="stats-row" aria-label="求职数据概览">
      {cards.map((card) => (
        <TiltStatCard
          key={card.key}
          card={card}
          active={stageFilter === card.key}
          onClick={() => setStageFilter(card.key)}
        />
      ))}
    </div>
  );
}

function TiltStatCard({ card, active, onClick }) {
  const ref = useRef(null);
  const rafRef = useRef(0);

  function resetTilt() {
    const node = ref.current;
    if (!node) return;
    node.style.setProperty("--rx", "0deg");
    node.style.setProperty("--ry", "0deg");
    node.style.setProperty("--mx", "50%");
    node.style.setProperty("--my", "40%");
  }

  function handlePointerMove(event) {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || window.matchMedia("(pointer: coarse)").matches) {
      return;
    }
    const node = ref.current;
    if (!node) return;
    const rect = node.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width - 0.5;
    const y = (event.clientY - rect.top) / rect.height - 0.5;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      node.style.setProperty("--ry", `${x * 5}deg`);
      node.style.setProperty("--rx", `${y * -4}deg`);
      node.style.setProperty("--mx", `${(x + 0.5) * 100}%`);
      node.style.setProperty("--my", `${(y + 0.5) * 100}%`);
    });
  }

  return (
    <button
      ref={ref}
      type="button"
      className={`tilt-stat-card ${active ? "active" : ""}`}
      style={{ "--rx": "0deg", "--ry": "0deg", "--mx": "50%", "--my": "40%" }}
      onPointerMove={handlePointerMove}
      onPointerLeave={resetTilt}
      onClick={onClick}
    >
      <span className="stat-sheen" aria-hidden="true" />
      <b>{card.value}</b>
      <span>{card.label}</span>
    </button>
  );
}

function TrackerToolbar({ query, setQuery, quickFilter, setQuickFilter, visibleCount, totalCount, viewMode, setViewMode }) {
  return (
    <section className="tracker-toolbar" aria-label="搜索和筛选">
      <div className="search-row">
        <label className="search-box">
          <span>?</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索公司、岗位、城市、标签、绑定简历、备注或 JD"
          />
        </label>
        <div className="count-chip">显示 {visibleCount} / {totalCount}</div>
      </div>
      <div className="filter-row">
        <div className="quick-filters" aria-label="快速筛选">
          {QUICK_FILTERS.map((filter) => (
            <button
              key={filter.key}
              type="button"
              className={quickFilter === filter.key ? "active" : ""}
              onClick={() => setQuickFilter(filter.key)}
            >
              {filter.label}
            </button>
          ))}
        </div>
        <div className="view-switch" aria-label="视图切换">
          <button type="button" className={viewMode === "cards" ? "active" : ""} onClick={() => setViewMode("cards")}>卡片视图</button>
          <button type="button" className={viewMode === "table" ? "active" : ""} onClick={() => setViewMode("table")}>表格视图</button>
        </div>
      </div>
    </section>
  );
}

function KanbanBoard({ jobs, stats, updateJob, openAddJob, openEditJob, openDetail, confirmDelete }) {
  return (
    <section className="kanban-viewport" aria-label="横向校招投递看板">
      <div className="kanban-board">
        {STAGES.map((stage) => {
          const stageJobs = jobs.filter((job) => job.stage === stage.key);
          return (
            <section className={`kanban-column ${stage.accent}`} key={stage.key}>
              <div className="column-header">
                <div>
                  <h2>{stage.label}</h2>
                  <span>{stageJobs.length} / {stats[stage.key]} 个岗位</span>
                </div>
                <div className="column-actions">
                  <button className="icon-action column-icon-button" type="button" aria-label="编辑阶段名称">?</button>
                  <button className="icon-action column-icon-button" type="button" aria-label={`添加${stage.label}岗位`} onClick={() => openAddJob(stage.key)}>＋</button>
                </div>
              </div>
              <div className="column-scroll">
                {stageJobs.length === 0 ? (
                  <div className="column-empty">暂无匹配岗位</div>
                ) : (
                  stageJobs.map((job) => (
                    <JobCard
                      key={job.id}
                      job={job}
                      updateJob={updateJob}
                      openEditJob={openEditJob}
                      openDetail={openDetail}
                      confirmDelete={confirmDelete}
                    />
                  ))
                )}
              </div>
            </section>
          );
        })}
      </div>
    </section>
  );
}

function JobCard({ job, updateJob, openEditJob, openDetail, confirmDelete }) {
  const score = getScoreMeta(job.aiScore);
  const time = getTimeMeta(job);

  return (
    <article className={`job-card stage-${job.stage}`} onClick={() => openDetail(job)}>
      <div className="job-card-light" aria-hidden="true" />
      <div className="job-card-top">
        <div>
          <h3>{job.company}</h3>
          <p>{job.role}</p>
        </div>
        <div className="card-actions" onClick={(event) => event.stopPropagation()}>
          <button type="button" className={`icon-action card-action favorite ${job.favorite ? "active" : ""}`} aria-label="收藏岗位" onClick={() => updateJob(job.id, { favorite: !job.favorite })}>★</button>
          <button type="button" className="icon-action card-action is-danger" aria-label="删除岗位" onClick={() => confirmDelete(job)}>删</button>
          <button type="button" className="icon-action card-action card-expand" onClick={() => openDetail(job)}>展开</button>
        </div>
      </div>
      <div className="job-meta-row">
        <span>{job.city}</span>
        <span className={`time-pill ${time.status}`}>{time.label}</span>
      </div>
      <div className="job-meta-row">
        <span className={`score-pill ${score.tone}`}>{score.label}</span>
        <span className={job.resume ? "resume-pill" : "resume-pill muted"}>{job.resume || "未绑定简历"}</span>
      </div>
      <div className="tag-list">
        {(job.tags ?? []).map((tag) => <span key={tag}>{tag}</span>)}
      </div>
      <div className="card-footer" onClick={(event) => event.stopPropagation()}>
        <select value={job.stage} onChange={(event) => updateJob(job.id, { stage: event.target.value })} aria-label="修改阶段">
          {STAGES.map((stage) => <option key={stage.key} value={stage.key}>{stage.label}</option>)}
        </select>
        <button type="button" className="ghost-button compact-action" onClick={() => openEditJob(job)}>编辑</button>
      </div>
    </article>
  );
}

function JobsTable({ jobs, updateJob, openEditJob, openDetail, confirmDelete }) {
  return (
    <section className="table-panel" aria-label="表格视图">
      <table className="jobs-table">
        <thead>
          <tr>
            <th>公司</th>
            <th>岗位</th>
            <th>城市</th>
            <th>阶段</th>
            <th>时间</th>
            <th>匹配</th>
            <th>简历</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          {jobs.map((job) => (
            <tr key={job.id}>
              <td>{job.company}</td>
              <td>{job.role}</td>
              <td>{job.city}</td>
              <td>
                <select value={job.stage} onChange={(event) => updateJob(job.id, { stage: event.target.value })}>
                  {STAGES.map((stage) => <option key={stage.key} value={stage.key}>{stage.label}</option>)}
                </select>
              </td>
              <td>{getTimeMeta(job).label}</td>
              <td>{getScoreMeta(job.aiScore).label}</td>
              <td>{job.resume || "未绑定"}</td>
              <td>
                <div className="table-actions">
                  <button type="button" className="ghost-button table-action" onClick={() => openDetail(job)}>详情</button>
                  <button type="button" className="ghost-button table-action" onClick={() => openEditJob(job)}>编辑</button>
                  <button type="button" className="ghost-button table-action is-danger" onClick={() => confirmDelete(job)}>删除</button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function JobFormDrawer({ form, setForm, error, editingJob, onSubmit, onCancel }) {
  function updateField(name, value) {
    setForm((current) => ({ ...current, [name]: value }));
  }

  return (
    <div className="drawer-layer" role="dialog" aria-modal="true" aria-label={editingJob ? "编辑岗位" : "添加岗位"}>
      <form className="drawer-panel form-drawer" onSubmit={onSubmit}>
        <div className="drawer-heading">
          <span className="panel-tag">{editingJob ? "编辑岗位" : "添加岗位"}</span>
          <h2>{editingJob ? "更新投递信息" : "记录新的校招机会"}</h2>
          <button type="button" className="icon-action" onClick={onCancel} aria-label="关闭">×</button>
        </div>
        {error && <div className="form-error">{error}</div>}
        <div className="form-grid">
          <Field label="公司名称" required value={form.company} onChange={(value) => updateField("company", value)} />
          <Field label="岗位名称" required value={form.role} onChange={(value) => updateField("role", value)} />
          <Field label="城市" required value={form.city} onChange={(value) => updateField("city", value)} />
          <label className="field">
            <span>当前阶段</span>
            <select value={form.stage} onChange={(event) => updateField("stage", event.target.value)}>
              {STAGES.map((stage) => <option key={stage.key} value={stage.key}>{stage.label}</option>)}
            </select>
          </label>
          <Field label="截止时间" type="date" value={form.deadline} onChange={(value) => updateField("deadline", value)} />
          <Field label="笔试或面试时间" type="datetime-local" value={form.eventTime} onChange={(value) => updateField("eventTime", value)} />
          <Field label="岗位链接" value={form.link} onChange={(value) => updateField("link", value)} />
          <Field label="绑定简历" value={form.resume} onChange={(value) => updateField("resume", value)} />
          <Field label="AI 匹配分数" type="number" min="0" max="100" value={form.aiScore} onChange={(value) => updateField("aiScore", value)} />
          <Field label="标签" value={form.tags} placeholder="用顿号或逗号分隔" onChange={(value) => updateField("tags", value)} />
          <label className="field full">
            <span>JD 内容</span>
            <textarea value={form.jd} onChange={(event) => updateField("jd", event.target.value)} />
          </label>
          <label className="field full">
            <span>备注</span>
            <textarea value={form.notes} onChange={(event) => updateField("notes", event.target.value)} />
          </label>
          <label className="check-field full">
            <input type="checkbox" checked={form.favorite} onChange={(event) => updateField("favorite", event.target.checked)} />
            <span>收藏这个岗位</span>
          </label>
        </div>
        <div className="drawer-actions">
          <button type="button" className="ghost-button" onClick={onCancel}>取消</button>
          <button type="submit" className="primary-action add-job-button">{editingJob ? "保存修改" : "保存岗位"}</button>
        </div>
      </form>
    </div>
  );
}

function Field({ label, value, onChange, required = false, type = "text", placeholder = "", min, max }) {
  return (
    <label className="field">
      <span>{label}{required ? " *" : ""}</span>
      <input
        type={type}
        value={value}
        min={min}
        max={max}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function ResumeUploadDialog({ jobs, existingResumes, onClose, onUploaded, onViewResume, onBindResume }) {
  const inputRef = useRef(null);
  const [draft, setDraft] = useState(null);
  const [duplicateFile, setDuplicateFile] = useState(null);
  const [overwriteName, setOverwriteName] = useState("");
  const [error, setError] = useState("");
  const [phase, setPhase] = useState("idle");
  const [progress, setProgress] = useState(0);
  const [uploadedResume, setUploadedResume] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [bindingOpen, setBindingOpen] = useState(false);
  const [selectedJobIds, setSelectedJobIds] = useState([]);
  const [bindMessage, setBindMessage] = useState("");

  const busy = phase === "uploading" || phase === "parsing";

  function openFilePicker() {
    if (!busy) inputRef.current?.click();
  }

  function clearDraft() {
    setDraft(null);
    setDuplicateFile(null);
    setOverwriteName("");
    setUploadedResume(null);
    setProgress(0);
    setPhase("idle");
    setSelectedJobIds([]);
    setBindingOpen(false);
    setBindMessage("");
    setError("");
    if (inputRef.current) inputRef.current.value = "";
  }

  function handleClose() {
    if (busy) return;
    clearDraft();
    onClose();
  }

  function chooseFile(file) {
    setError("");
    setBindMessage("");
    setUploadedResume(null);
    setBindingOpen(false);
    setProgress(0);
    setPhase("idle");

    const validationError = validateResumeFile(file);
    if (validationError) {
      setDraft(null);
      setError(validationError);
      return;
    }

    const duplicate = existingResumes.find((resume) => resume.fileName.toLowerCase() === file.name.toLowerCase());
    if (duplicate) {
      setDraft(null);
      setDuplicateFile(file);
      setOverwriteName(file.name);
      return;
    }

    setDraft({ file, fileName: file.name });
    setDuplicateFile(null);
    setOverwriteName("");
  }

  function resolveDuplicate(mode) {
    if (!duplicateFile) return;

    if (mode === "cancel") {
      clearDraft();
      return;
    }

    const fileName = mode === "rename"
      ? createRenamedFileName(duplicateFile.name, existingResumes.map((resume) => resume.fileName))
      : duplicateFile.name;
    setDraft({ file: duplicateFile, fileName });
    setDuplicateFile(null);
    setOverwriteName(mode === "overwrite" ? duplicateFile.name : "");
  }

  async function submitUpload() {
    if (!draft || busy) return;

    setError("");
    setProgress(0);
    setPhase("uploading");

    try {
      const uploadResult = await uploadResumeFile(draft.file, {
        onProgress: setProgress,
        onParsing: () => setPhase("parsing"),
      });
      const record = createResumeRecord(draft.fileName, draft.file, uploadResult);
      onUploaded(record, overwriteName);
      setUploadedResume(record);
      setPhase("success");
      setProgress(100);
    } catch {
      setPhase("failed");
      setError("上传失败，请重试。");
    }
  }

  function toggleJob(jobId) {
    setSelectedJobIds((current) => (
      current.includes(jobId) ? current.filter((id) => id !== jobId) : [...current, jobId]
    ));
    setBindMessage("");
  }

  function bindResume() {
    if (!uploadedResume) return;
    if (selectedJobIds.length === 0) {
      setBindMessage("请至少选择一个岗位。");
      return;
    }
    onBindResume(uploadedResume, selectedJobIds);
    setBindMessage(`已绑定到 ${selectedJobIds.length} 个岗位。`);
  }

  function handleDrag(event, isActive) {
    event.preventDefault();
    if (!busy) setDragging(isActive);
  }

  function handleDrop(event) {
    event.preventDefault();
    setDragging(false);
    if (busy) return;
    chooseFile(event.dataTransfer.files?.[0]);
  }

  const statusLabel = phase === "uploading"
    ? "正在上传"
    : phase === "parsing"
      ? "正在解析"
      : phase === "success"
        ? "上传成功"
        : phase === "failed"
          ? "上传失败，请重试"
          : "待上传";

  return (
    <div className="upload-modal-layer" role="dialog" aria-modal="true" aria-label="上传简历文件">
      <section className="upload-modal-panel">
        <div className="upload-modal-heading">
          <div>
            <span className="panel-tag">Resume Upload</span>
            <h2>上传简历文件</h2>
            <p>上传现有简历，方便绑定岗位、分析匹配度和管理投递进度</p>
          </div>
          <button className="icon-action" type="button" aria-label="关闭上传弹窗" onClick={handleClose} disabled={busy}>×</button>
        </div>

        <button
          className={`resume-dropzone ${dragging ? "is-dragging" : ""}`}
          type="button"
          onClick={openFilePicker}
          onDragEnter={(event) => handleDrag(event, true)}
          onDragOver={(event) => handleDrag(event, true)}
          onDragLeave={(event) => handleDrag(event, false)}
          onDrop={handleDrop}
          disabled={busy}
        >
          <span className="upload-cloud" aria-hidden="true" />
          <strong>点击选择文件，或将简历拖拽到这里</strong>
          <small>支持 PDF、DOC、DOCX 格式，单个文件不超过 10MB</small>
        </button>
        <input
          ref={inputRef}
          className="hidden-file-input"
          type="file"
          accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          onChange={(event) => chooseFile(event.target.files?.[0])}
        />

        {duplicateFile && (
          <div className="upload-warning">
            <strong>已存在同名简历</strong>
            <span>“{duplicateFile.name}” 已在当前会话中上传。请选择覆盖、重新命名或取消。</span>
            <div>
              <button className="ghost-button table-action" type="button" onClick={() => resolveDuplicate("overwrite")}>覆盖</button>
              <button className="ghost-button table-action" type="button" onClick={() => resolveDuplicate("rename")}>重新命名</button>
              <button className="ghost-button table-action" type="button" onClick={() => resolveDuplicate("cancel")}>取消</button>
            </div>
          </div>
        )}

        {error && <div className="form-error">{error}</div>}

        {draft && (
          <div className="resume-file-card">
            <span className="resume-file-icon">{draft.fileName.split(".").pop()?.toUpperCase()}</span>
            <div>
              <strong>{draft.fileName}</strong>
              <small>{formatFileSize(draft.file.size)} · {statusLabel}</small>
              {(phase === "uploading" || phase === "parsing" || phase === "success") && (
                <div className="upload-progress" aria-label={`上传进度 ${progress}%`}>
                  <span style={{ width: `${progress}%` }} />
                </div>
              )}
            </div>
            <button className="ghost-button table-action" type="button" onClick={clearDraft} disabled={busy}>
              删除
            </button>
          </div>
        )}

        {phase === "success" && uploadedResume && (
          <div className="upload-success-panel">
            <strong>简历上传成功</strong>
            <span>当前为开发预览状态，已保存简历名称和基础信息，未长期保存文件内容。</span>
            <div className="upload-success-actions">
              <button className="primary-action add-job-button" type="button" onClick={() => onViewResume(uploadedResume)}>查看简历</button>
              <button className="campus-link-button" type="button" onClick={() => setBindingOpen((open) => !open)}>绑定到岗位</button>
            </div>
          </div>
        )}

        {bindingOpen && uploadedResume && (
          <div className="resume-bind-panel">
            <div>
              <h3>选择要绑定的岗位</h3>
              <p>绑定后，岗位卡片会显示“{uploadedResume.fileName}”。</p>
            </div>
            <div className="resume-bind-list">
              {jobs.map((job) => (
                <label key={job.id} className="resume-bind-item">
                  <input type="checkbox" checked={selectedJobIds.includes(job.id)} onChange={() => toggleJob(job.id)} />
                  <span>
                    <strong>{job.company}</strong>
                    <small>{job.role} · {job.city}</small>
                  </span>
                </label>
              ))}
            </div>
            {bindMessage && <div className="upload-bind-message">{bindMessage}</div>}
            <button className="primary-action add-job-button" type="button" onClick={bindResume}>确认绑定</button>
          </div>
        )}

        <div className="upload-modal-actions">
          <button className="ghost-button" type="button" onClick={handleClose} disabled={busy}>取消</button>
          <button className="primary-action add-job-button" type="button" onClick={submitUpload} disabled={!draft || busy || phase === "success"}>
            {phase === "uploading" ? "正在上传" : phase === "parsing" ? "正在解析" : "确认上传"}
          </button>
        </div>
      </section>
    </div>
  );
}

function JobDetailDrawer({ job, closing, updateJob, onClose, onEdit, onDelete }) {
  const score = getScoreMeta(job.aiScore);
  const timeline = getTimeline(job);

  return (
    <div
      className={`detail-drawer-layer ${closing ? "is-closing" : ""}`}
      role="dialog"
      aria-modal="true"
      aria-label="岗位详情"
      onMouseDown={onClose}
    >
      <aside className="drawer-panel detail-drawer" onMouseDown={(event) => event.stopPropagation()}>
        <div className="drawer-heading detail-drawer-heading">
          <div>
            <span className="panel-tag">岗位详情</span>
            <h2>{job.company}</h2>
          </div>
          <button type="button" className="icon-action detail-close-button" onClick={onClose} aria-label="关闭岗位详情">×</button>
        </div>
        <div className="detail-stack">
          <section>
            <h3>{job.role}</h3>
            <p>{job.city} · {getTimeMeta(job).label} · {score.label}</p>
            <div className="tag-list">{(job.tags ?? []).map((tag) => <span key={tag}>{tag}</span>)}</div>
          </section>
          <section>
            <h4>阶段</h4>
            <select value={job.stage} onChange={(event) => updateJob(job.id, { stage: event.target.value })}>
              {STAGES.map((stage) => <option key={stage.key} value={stage.key}>{stage.label}</option>)}
            </select>
          </section>
          <section>
            <h4>JD 内容</h4>
            <p>{job.jd || "暂无 JD 内容"}</p>
          </section>
          <section>
            <h4>绑定简历</h4>
            <p>{job.resume || "未绑定简历"}</p>
          </section>
          <section>
            <h4>备注</h4>
            <p>{job.notes || "暂无备注"}</p>
          </section>
          <section>
            <h4>投递记录时间线</h4>
            <ol className="timeline">
              {timeline.map((item) => <li key={item}>{item}</li>)}
            </ol>
          </section>
        </div>
        <div className="drawer-actions">
          <button type="button" className="ghost-button" onClick={onDelete}>删除岗位</button>
          <button type="button" className="primary-action add-job-button" onClick={onEdit}>编辑岗位</button>
        </div>
      </aside>
    </div>
  );
}

function ConfirmDialog({ job, onCancel, onConfirm }) {
  return (
    <div className="confirm-layer" role="dialog" aria-modal="true" aria-label="删除确认">
      <section className="confirm-box">
        <span className="panel-tag">删除确认</span>
        <h2>删除 {job.company} 的投递记录？</h2>
        <p>删除后该岗位会从所有阶段中移除。这个操作只影响本地保存的数据。</p>
        <div className="drawer-actions">
          <button className="ghost-button" type="button" onClick={onCancel}>取消</button>
          <button className="danger-button" type="button" onClick={onConfirm}>确认删除</button>
        </div>
      </section>
    </div>
  );
}

function EmptyState({ clearFilters }) {
  return (
    <section className="empty-state">
      <span className="panel-tag">无匹配结果</span>
      <h2>当前搜索和筛选没有找到岗位</h2>
      <p>可以清空筛选，或者添加一个新的校招岗位。</p>
      <button type="button" className="ghost-button" onClick={clearFilters}>清空筛选</button>
    </section>
  );
}

function ResumePage() {
  const uploadedResumes = getSessionResumeUploads();
  const highlightedResumeId = new URLSearchParams(window.location.search).get("resume")
    ?? window.sessionStorage.getItem(LAST_UPLOADED_RESUME_KEY);

  return (
    <section className="workspace-panel" aria-label="简历页面">
      <PanelHeading title="简历优化" description="上传、解析并优化简历内容，集中管理诊断结果与修改建议。" />
      <div className="workspace-grid">
        <section className="workspace-card upload-card">
          <span className="panel-tag">上传</span>
          <h2>简历文件</h2>
          <p>支持 PDF、Word 与纯文本格式，自动识别教育、项目、经历与技能字段。</p>
          <div className="workspace-dropzone">拖拽简历文件至此处</div>
          {uploadedResumes.length > 0 && (
            <div className="resume-session-list">
              {uploadedResumes.map((resume) => (
                <div className={resume.id === highlightedResumeId ? "resume-session-item is-highlighted" : "resume-session-item"} key={resume.id}>
                  <strong>{resume.fileName}</strong>
                  <span>{resume.fileType} · {formatFileSize(resume.fileSize)} · 开发预览</span>
                </div>
              ))}
            </div>
          )}
        </section>
        <section className="workspace-card">
          <span className="panel-tag">AI 分析</span>
          <h2>综合评分 86%</h2>
          <ProgressList items={[["表达清晰度", 84], ["岗位相关度", 76], ["成果量化", 62], ["关键词匹配", 71]]} />
        </section>
        <section className="workspace-card">
          <span className="panel-tag">优化建议</span>
          <h2>下一步动作</h2>
          <ul className="workspace-list">
            <li>补充项目结果与量化指标</li>
            <li>将经历改写为动作、方法、结果</li>
            <li>根据目标岗位强化关键词</li>
          </ul>
        </section>
      </div>
    </section>
  );
}

function CampusPage({ navigate }) {
  return <RecruitingMarketPage config={campusMarketConfig} navigate={navigate} />;
}

function InternshipPage({ navigate }) {
  return <RecruitingMarketPage config={internshipMarketConfig} navigate={navigate} />;
}

const socialRecruitmentInitialForm = {
  keyword: "",
  city: "全国",
  salaryMin: "",
  salaryMax: "",
  experience: "",
  education: "",
  industry: "不限",
  workType: "全职",
  excludeKeywords: "",
};

function SocialRecruitmentPage() {
  const [form, setForm] = useState(socialRecruitmentInitialForm);
  const [formError, setFormError] = useState("");
  const [status, setStatus] = useState("idle");
  const [statusMessage, setStatusMessage] = useState("");
  const [searchResult, setSearchResult] = useState(null);
  const [sortBy, setSortBy] = useState("matchScore");
  const [socialResume, setSocialResume] = useState(null);
  const [socialMatchStatus, setSocialMatchStatus] = useState("idle");
  const [socialMatchError, setSocialMatchError] = useState("");
  const [smartMatchStatus, setSmartMatchStatus] = useState("idle");
  const [smartMatchResult, setSmartMatchResult] = useState("");
  const searchAbortRef = useRef(null);
  const socialMatchAbortRef = useRef(null);

  const sortedJobs = useMemo(() => (
    sortSocialRecruitmentJobs(searchResult?.jobs ?? [], sortBy)
  ), [searchResult, sortBy]);

  useEffect(() => () => {
    searchAbortRef.current?.abort();
    socialMatchAbortRef.current?.abort();
  }, []);

  function updateFormField(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
    if (field === "keyword" && value.trim()) {
      setFormError("");
    }
  }

  async function runSearch() {
    if (!form.keyword.trim()) {
      setFormError("请填写岗位关键词。");
      setStatus("idle");
      return;
    }

    searchAbortRef.current?.abort();
    const controller = new AbortController();
    searchAbortRef.current = controller;
    setStatus("loading");
    setStatusMessage("");
    setFormError("");
    setSmartMatchStatus("idle");

    try {
      const result = await searchSocialRecruitmentJobs(form, { signal: controller.signal });
      setSearchResult(result);
      setStatus(result.jobs.length > 0 ? "success" : "empty");
      setStatusMessage("");
    } catch (error) {
      if (error?.name === "AbortError") return;
      setSearchResult(null);
      setStatus(error?.code === "TIMEOUT" ? "timeout" : "failed");
      setStatusMessage(error?.message || "社招搜索失败，请稍后重新搜索。");
    } finally {
      searchAbortRef.current = null;
    }
  }

  function handleSubmit(event) {
    event.preventDefault();
    runSearch();
  }

  function resetConditions() {
    searchAbortRef.current?.abort();
    setForm(socialRecruitmentInitialForm);
    setFormError("");
    setStatus("idle");
    setStatusMessage("");
    setSearchResult(null);
    setSortBy("matchScore");
    setSocialMatchStatus("idle");
    setSocialMatchError("");
    setSmartMatchStatus("idle");
    setSmartMatchResult("");
  }

  async function uploadSocialResume(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    const validationError = validateResumeFile(file);
    if (validationError) {
      setSocialMatchError(validationError);
      setSmartMatchStatus("error");
      return;
    }

    setSocialResume({
      fileName: file.name,
      fileSize: file.size,
      fileType: (file.name.split(".").pop() || "FILE").toUpperCase(),
    });
    setSocialMatchError("");
    setSmartMatchResult("");
    setSmartMatchStatus("loading");
    try {
      const resultText = await jobSmartMatching({ file });
      setSmartMatchResult(resultText ?? "");
      setSmartMatchStatus("success");
    } catch (error) {
      setSmartMatchResult("");
      setSmartMatchStatus("error");
      setSocialMatchError(error.message || "智能匹配失败，请稍后重试。");
    }
  }

  function toSocialBatchMatchJob(job) {
    return {
      jobId: job.id,
      companyName: job.companyName,
      positionName: job.positionName,
      industry: job.industry,
      location: job.city,
      education: job.education,
      description: job.description,
      requirements: [
        job.experience,
        job.education,
        job.industry,
        ...(job.keywords ?? []),
      ].filter(Boolean).join("；"),
    };
  }

  async function runSocialResumeMatch() {
    if (!socialResume?.id) {
      setSocialMatchError("请先上传简历。");
      return;
    }
    const jobs = searchResult?.jobs ?? [];
    if (jobs.length === 0) {
      setSocialMatchError("请先搜索岗位，再进行简历匹配。");
      return;
    }

    socialMatchAbortRef.current?.abort();
    const controller = new AbortController();
    socialMatchAbortRef.current = controller;
    setSocialMatchStatus("matching");
    setSocialMatchError("");
    try {
      const response = await analyzeJobBatchMatch({
        resumeId: socialResume.id,
        jobs: jobs.slice(0, 20).map(toSocialBatchMatchJob),
      }, { signal: controller.signal });
      const results = Array.isArray(response?.results) ? response.results : [];
      const scoreById = new Map(results.map((result) => [String(result.jobId ?? result.job_id), result]));
      setSearchResult((current) => {
        if (!current) return current;
        return {
          ...current,
          jobs: current.jobs.map((job) => {
            const result = scoreById.get(String(job.id));
            const aiScore = getOverallScore(result);
            if (aiScore == null) return job;
            return {
              ...job,
              matchScore: aiScore,
              matchLevel: result?.matchLevel ?? result?.match_level ?? job.matchLevel,
              matchReasons: result?.matchReasons ?? result?.match_reasons ?? job.matchReasons,
              riskWarnings: result?.riskWarnings ?? result?.risk_warnings ?? job.riskWarnings,
              aiResumeMatch: result,
            };
          }),
        };
      });
      setSortBy("matchScore");
      setSocialMatchStatus("matched");
    } catch (error) {
      if (controller.signal.aborted) return;
      setSocialMatchStatus("error");
      setSocialMatchError(error.message || "AI岗位匹配失败，请稍后重试。");
    } finally {
      if (!controller.signal.aborted) socialMatchAbortRef.current = null;
    }
  }

  const isLoading = status === "loading";
  const resultMode = searchResult?.mode ?? "demo";

  return (
    <section className="social-recruitment-page" aria-label="社招岗位智能匹配页面">
      <div className="social-hero">
        <div>
          <span className="market-eyebrow">社会招聘 · 智能匹配 V1</span>
          <h1>社招岗位智能匹配</h1>
          <p>输入求职条件，快速查找更适合你的社会招聘岗位</p>
        </div>
        <div className="social-resume-match-card">
          <span>AI简历匹配</span>
          <strong>{socialResume ? socialResume.fileName : "上传简历匹配社招岗位"}</strong>
          <small>{socialResume ? `${formatFileSize(socialResume.fileSize)} · 已就绪` : "支持 PDF / DOC / DOCX，上传后自动智能匹配"}</small>
          <div className="social-resume-actions">
            <label>
              {smartMatchStatus === "loading" ? "智能匹配中…" : socialResume ? "上传简历重新匹配" : "上传简历智能匹配"}
              <input
                type="file"
                accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                disabled={smartMatchStatus === "loading" || socialMatchStatus === "matching"}
                onChange={uploadSocialResume}
              />
            </label>
            <button type="button" onClick={runSocialResumeMatch} disabled={!socialResume || socialMatchStatus === "matching" || smartMatchStatus === "loading"}>
              {socialMatchStatus === "matching" ? "匹配中..." : "岗位匹配"}
            </button>
          </div>
          {socialMatchStatus === "matched" && <p className="social-resume-success">已按简历匹配度更新排序</p>}
          {socialMatchError && <p className="social-resume-error">{socialMatchError}</p>}
        </div>
        <div className="social-mode-card">
          <span>信息汇总</span>
          <strong>本站仅收集汇总岗位信息</strong>
          <small>如需投递，请前往岗位实际招聘平台</small>
        </div>
      </div>

      <div className="social-notice-stack">
        <p>岗位信息来自公开网页，可能存在延迟或变化，请以原招聘平台信息为准。</p>
        <p>本站仅对岗位进行收集汇总，如需投递请到岗位实际招聘平台。</p>
      </div>

      <form className="social-search-panel" onSubmit={handleSubmit}>
        <div className="social-form-grid">
          <label className="is-wide">
            <span>岗位关键词 *</span>
            <input
              value={form.keyword}
              onChange={(event) => updateFormField("keyword", event.target.value)}
              placeholder="例如：前端开发、Java工程师、产品助理"
              aria-invalid={Boolean(formError)}
            />
          </label>
          <label>
            <span>工作城市</span>
            <select value={form.city} onChange={(event) => updateFormField("city", event.target.value)}>
              {socialRecruitmentOptions.cities.map((city) => <option key={city} value={city}>{city}</option>)}
            </select>
          </label>
          <label>
            <span>期望最低薪资</span>
            <input type="number" min="0" step="1000" value={form.salaryMin} onChange={(event) => updateFormField("salaryMin", event.target.value)} placeholder="8000" />
          </label>
          <label>
            <span>期望最高薪资</span>
            <input type="number" min="0" step="1000" value={form.salaryMax} onChange={(event) => updateFormField("salaryMax", event.target.value)} placeholder="15000" />
          </label>
          <label>
            <span>工作经验</span>
            <select value={form.experience} onChange={(event) => updateFormField("experience", event.target.value)}>
              <option value="">不限</option>
              {socialRecruitmentOptions.experiences.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
          <label>
            <span>学历要求</span>
            <select value={form.education} onChange={(event) => updateFormField("education", event.target.value)}>
              <option value="">不限</option>
              {socialRecruitmentOptions.educations.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
          <label>
            <span>所属行业</span>
            <select value={form.industry} onChange={(event) => updateFormField("industry", event.target.value)}>
              {socialRecruitmentOptions.industries.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
          <label>
            <span>工作类型</span>
            <select value={form.workType} onChange={(event) => updateFormField("workType", event.target.value)}>
              {socialRecruitmentOptions.workTypes.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
          <label className="is-wide">
            <span>排除关键词</span>
            <input
              value={form.excludeKeywords}
              onChange={(event) => updateFormField("excludeKeywords", event.target.value)}
              placeholder="例如：销售、外包、培训，多个关键词可用逗号分隔"
            />
          </label>
        </div>

        {formError && <p className="social-form-error">{formError}</p>}

        <div className="social-form-actions">
          <button className="market-primary-action" type="submit" disabled={isLoading}>
            {isLoading ? "搜索中..." : "搜索匹配"}
          </button>
          <button className="social-reset-button" type="button" onClick={resetConditions} disabled={isLoading}>重置条件</button>
        </div>
      </form>

      {smartMatchStatus === "loading" ? (
        <SocialSmartMatchLoading />
      ) : smartMatchStatus === "success" ? (
        <SocialSmartMatchResult text={smartMatchResult} />
      ) : smartMatchStatus === "error" ? (
        <SocialStateCard title="智能匹配失败" description={socialMatchError || "智能匹配失败，请稍后重试。"} />
      ) : (
        <>
          <div className="social-result-toolbar">
            <div>
              <strong>匹配结果</strong>
              <span>{searchResult ? `共 ${sortedJobs.length} 个岗位 · ${searchResult.mode === "demo" ? "演示数据" : "真实搜索"}` : "等待输入条件"}</span>
            </div>
            <label>
              <span>排序</span>
              <select value={sortBy} onChange={(event) => setSortBy(event.target.value)}>
                {socialRecruitmentOptions.sortOptions.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
              </select>
            </label>
          </div>

          {status === "loading" && (
            <SocialStateCard title="正在搜索匹配" description="正在根据关键词、城市、薪资和经验等条件计算综合匹配度。" />
          )}

          {status === "failed" && (
            <SocialStateCard title="搜索失败" description={statusMessage || "社招搜索失败，请稍后重新搜索。"} onRetry={runSearch} />
          )}

          {status === "timeout" && (
            <SocialStateCard title="搜索超时" description={statusMessage || "社招搜索超时，请缩小条件后重新搜索。"} onRetry={runSearch} />
          )}

          {status === "empty" && (
            <SocialStateCard title="没有找到匹配岗位" description="可以调整关键词、城市、工作类型，或减少排除关键词后重新搜索。" onRetry={runSearch} />
          )}

          {status === "success" && (
            <div className="social-job-grid">
              {sortedJobs.map((job) => <SocialJobCard job={job} key={job.id} />)}
            </div>
          )}
        </>
      )}
    </section>
  );
}

function SocialStateCard({ title, description, onRetry }) {
  return (
    <div className="social-state-card">
      <strong>{title}</strong>
      <p>{description}</p>
      {onRetry && <button type="button" onClick={onRetry}>重新搜索</button>}
    </div>
  );
}

function renderSmartMatchLinks(text) {
  if (!text) return null;
  const nodes = [];
  const pattern = /(\[([^\]]+)\]\((https?:\/\/[^\s)]+)\))|(https?:\/\/[^\s<>"']+)/g;
  const trailingPunct = /[，。；：！？」』）)\]}>、]+$/;
  let lastIndex = 0;
  let key = 0;
  let match;
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(<span key={`s-${key++}`}>{text.slice(lastIndex, match.index)}</span>);
    }
    if (match[1]) {
      nodes.push(
        <a key={`a-${key++}`} href={match[3]} target="_blank" rel="noopener noreferrer">
          {match[2]}
        </a>
      );
    } else {
      const url = match[0].replace(trailingPunct, "");
      nodes.push(
        <a key={`a-${key++}`} href={url} target="_blank" rel="noopener noreferrer">
          {url}
        </a>
      );
    }
    lastIndex = pattern.lastIndex;
  }
  if (lastIndex < text.length) {
    nodes.push(<span key={`s-${key++}`}>{text.slice(lastIndex)}</span>);
  }
  return nodes;
}

function SocialSmartMatchResult({ text }) {
  return (
    <div className="social-smart-match-result">
      <div className="social-smart-match-head">
        <strong>AI 智能匹配结果</strong>
        <span>以下岗位链接来自简历智能匹配，点击可跳转至原招聘平台</span>
      </div>
      <div className="social-smart-match-body">{renderSmartMatchLinks(text)}</div>
    </div>
  );
}

function SocialSmartMatchLoading() {
  const messages = [
    "正在解析简历内容…",
    "正在匹配海量社招岗位…",
    "正在计算岗位匹配度…",
    "正在生成岗位投递链接…",
  ];
  const [index, setIndex] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => setIndex((current) => (current + 1) % messages.length), 5000);
    return () => window.clearInterval(timer);
  }, [messages.length]);
  return (
    <div className="social-smart-match-loading" role="status" aria-live="polite">
      <div className="social-smart-spinner" aria-hidden="true" />
      <strong>正在智能匹配岗位</strong>
      <p>{messages[index]}</p>
      <div className="social-smart-progress" aria-hidden="true"><span /></div>
      <small>通常需要几十秒，请稍候…</small>
    </div>
  );
}

function SocialJobCard({ job }) {
  const hasSourceUrl = /^https?:\/\//i.test(String(job.sourceUrl ?? ""));
  const hasApplicationUrl = /^https?:\/\//i.test(String(job.applicationUrl ?? ""));
  return (
    <article className="social-job-card">
      <div className="social-job-head">
        <div>
          <span>{job.companyName}</span>
          <h2>{job.positionName}</h2>
        </div>
        <div className="social-score">
          <strong>{job.matchScore}</strong>
          <span>{job.matchLevel}</span>
        </div>
      </div>

      <div className="social-job-meta">
        <span>{job.city || "城市未注明"}</span>
        <span>{formatSocialSalary(job)}</span>
        <span>{job.experience || "经验未注明"}</span>
        <span>{job.education || "学历未注明"}</span>
        <span>{job.industry || "行业未注明"}</span>
        <span>{job.workType || "类型未注明"}</span>
        <span>{job.source || "来源未注明"}</span>
        <span>{job.publishedAt || "发布时间未注明"}</span>
      </div>

      <div className="social-explain-grid">
        <section>
          <strong>匹配原因</strong>
          <ul>
            {(job.matchReasons ?? []).slice(0, 5).map((reason) => <li key={reason}>{reason}</li>)}
          </ul>
        </section>
        <section>
          <strong>不匹配项或风险提示</strong>
          {(job.riskWarnings ?? []).length > 0 ? (
            <ul>
              {job.riskWarnings.map((warning) => <li key={warning}>{warning}</li>)}
            </ul>
          ) : (
            <p>暂未发现明显风险，仍需以原招聘平台为准。</p>
          )}
        </section>
      </div>

      <div className="social-card-footer">
        <small>{job.source === "演示数据" ? "演示数据" : "岗位方向参考"}</small>
        {hasSourceUrl ? (
          <a href={job.sourceUrl} target="_blank" rel="noopener noreferrer">查看原岗位</a>
        ) : (
          <button type="button" disabled>查看原岗位</button>
        )}
        {hasApplicationUrl ? <a href={job.applicationUrl} target="_blank" rel="noopener noreferrer">前往官网投递</a> : null}
      </div>
    </article>
  );
}

const EMPTY_TEXT = "未提供";

function valueOrEmpty(value) {
  const text = String(value ?? "").trim();
  return text || EMPTY_TEXT;
}

function normalizeFilterOption(option) {
  if (option && typeof option === "object") {
    return {
      value: String(option.value ?? ""),
      label: String(option.label ?? option.value ?? ""),
    };
  }
  return { value: String(option ?? ""), label: String(option ?? "") };
}

function isProvided(value) {
  const text = String(value ?? "").trim();
  return Boolean(text && text !== EMPTY_TEXT);
}

function isExternalUrl(value) {
  return /^https?:\/\//i.test(String(value ?? "").trim());
}

function firstAvailable(...values) {
  return values.map((value) => String(value ?? "").trim()).find(Boolean) ?? "";
}

function normalizeRecruitmentType(value, fallback = "") {
  const text = String(value || fallback || "").toUpperCase();
  if (text.includes("CAMPUS_AND_INTERNSHIP")) return "CAMPUS_AND_INTERNSHIP";
  if (text.includes("INTERNSHIP") || String(fallback).includes("实习")) return "INTERNSHIP";
  if (text.includes("CAMPUS") || String(fallback).includes("校招")) return "CAMPUS";
  return "OTHER";
}

function createRecruitmentLookups(dataset) {
  const companiesBySlug = new Map((dataset.companies ?? []).map((company) => [company.slug, company]));
  const categoriesByCode = new Map((dataset.categories ?? []).map((category) => [category.code, category]));
  const referralByCompany = new Map();
  (dataset.referralCodes ?? []).forEach((item) => {
    if (!item.companySlug || referralByCompany.has(item.companySlug)) return;
    referralByCompany.set(item.companySlug, item);
  });
  return { companiesBySlug, categoriesByCode, referralByCompany };
}

function getProgramForPosition(company, position) {
  const programs = Array.isArray(company?.programs) ? company.programs : [];
  return programs.find((program) => program.sourceKey === position.programSourceKey) ?? programs[0] ?? null;
}

function getApplicationUrl(company, position) {
  const links = Array.isArray(company?.applicationLinks) ? company.applicationLinks : [];
  const exact = links.find((link) => link.positionSourceKey && link.positionSourceKey === position.sourceKey);
  const generic = links.find((link) => !link.positionSourceKey);
  return firstAvailable(position.officialApplyUrl, exact?.urlNormalized, exact?.urlRaw, generic?.urlNormalized, generic?.urlRaw, company?.careerWebsite, company?.officialWebsite);
}

function makeRecruitmentJob(position, dataset, marketType) {
  const lookups = createRecruitmentLookups(dataset);
  const company = lookups.companiesBySlug.get(position.companySlug) ?? {};
  const category = lookups.categoriesByCode.get(company.categoryCode) ?? {};
  const program = getProgramForPosition(company, position);
  const referral = lookups.referralByCompany.get(position.companySlug);
  const rawRecruitmentType = normalizeRecruitmentType(program?.recruitmentType, position.employmentType);
  const recruitmentType = rawRecruitmentType === "OTHER" && /届|校招|校园招聘/.test(String(program?.title ?? position.programTitle ?? ""))
    ? "CAMPUS"
    : rawRecruitmentType;
  const companyName = firstAvailable(position.companyName, company.displayName, company.nameZh, company.nameEn, position.companySlug);
  const programTitle = valueOrEmpty(program?.title ?? position.programTitle);
  const positionName = valueOrEmpty(position.positionName);
  const city = valueOrEmpty(position.city ?? position.locationText ?? program?.workLocations);
  const salary = firstAvailable(position.salaryText, program?.salaryReference);
  const officialApplyUrl = firstAvailable(position.officialApplyUrl, position.applyUrl, position.applicationUrl);
  const applyUrl = firstAvailable(officialApplyUrl, getApplicationUrl(company, position));
  const referralCode = referral?.code ?? "";
  const common = {
    id: marketType === "internship" ? (position.id ?? position.sourceKey) : position.sourceKey,
    jobId: position.id ?? position.sourceKey,
    recommendScore: position.recommendScore,
    recommendReasons: normalizeRecommendReasons(position.recommendReasons),
    companySlug: position.companySlug,
    company: companyName,
    role: positionName,
    industry: valueOrEmpty(position.positionCategory ?? category.name ?? company.categoryName),
    companyType: valueOrEmpty(company.categoryName ?? category.name),
    programTitle,
    recruitmentType,
    city,
    salaryText: valueOrEmpty(salary),
    targetAudience: valueOrEmpty(program?.targetAudience),
    recruitmentTime: valueOrEmpty(program?.startDateText ?? program?.startDate),
    officialApplyUrl: applyUrl,
    entryUrl: applyUrl,
    applyUrl,
    notice: valueOrEmpty(program?.summary ?? company.rawText ?? position.description),
    duties: valueOrEmpty(position.description ?? program?.summary),
    requirements: valueOrEmpty(program?.targetAudience),
    referralCode: valueOrEmpty(referralCode),
    referralNote: valueOrEmpty(referral?.note),
    rawCompany: company,
    rawPosition: position,
    rawProgram: program,
    favorite: false,
  };

  if (marketType === "campus") {
    return {
      ...common,
      graduation: program?.graduationYear ? `${program.graduationYear}届` : "不限届别",
      graduationYear: program?.graduationYear ? String(program.graduationYear) : "",
      batch: programTitle.includes("春") ? "春招" : programTitle.includes("秋") ? "秋招" : programTitle.includes("提前") ? "提前批" : "校招项目",
      recruitmentBatch: programTitle.includes("春") ? "春招" : programTitle.includes("秋") ? "秋招" : programTitle.includes("提前") ? "提前批" : "校招项目",
      positionCategory: valueOrEmpty(position.positionCategory),
      deadline: program?.startDate ?? "2026-12-31",
      education: valueOrEmpty(program?.targetAudience),
      major: valueOrEmpty(position.positionCategory),
      exam: "未提供",
      tags: [company.categoryName, category.name, `${program?.graduationYear ?? ""}届`, recruitmentType, position.positionCategory, city].filter(Boolean),
    };
  }

  const salaryNumber = Number(String(salary).match(/\d+/)?.[0] ?? 0);
  return {
    ...common,
    department: valueOrEmpty(position.positionCategory),
    internshipType: programTitle.includes("日常") ? "日常实习" : "暑期实习",
    positionCategory: valueOrEmpty(position.positionCategory),
    weeklyAttendanceDays: position.weeklyAttendanceDays ?? "",
    internshipDurationMonths: position.internshipDurationMonths ?? "",
    workMode: city.includes("远程") ? "远程实习" : "线下办公",
    salary: salaryNumber,
    attendance: "未提供",
    duration: "未提供",
    startDate: program?.startDate ?? "2026-12-31",
    remote: city.includes("远程") ? "远程" : "线下",
    conversion: program?.conversionInformation ? "可转正" : "未提供",
    education: valueOrEmpty(program?.targetAudience),
    skills: valueOrEmpty(position.positionCategory),
    growth: valueOrEmpty(program?.conversionInformation ?? program?.summary),
    tags: [company.categoryName, category.name, "大厂实习", "日薪200元以上", position.positionCategory, city].filter(Boolean),
    urgent: false,
  };
}

async function loadRecruitmentJobs(marketType, params = {}, options = {}) {
  const page = await getRecruitmentPositionPage(params, options);
  const dataset = {
    categories: [],
    companies: [],
    positions: page.content ?? [],
    referralCodes: [],
  };
  const targetTypes = marketType === "campus"
    ? new Set(["CAMPUS", "CAMPUS_AND_INTERNSHIP"])
    : new Set(["INTERNSHIP", "CAMPUS_AND_INTERNSHIP"]);

  const jobs = (dataset.positions ?? [])
    .map((position) => makeRecruitmentJob(position, dataset, marketType))
    .filter((job) => targetTypes.has(job.recruitmentType));

  return { jobs, page };
}

function makeCampusRecruitmentJob(item) {
  const company = item.company ?? "";
  const position = item.position ?? "";
  const city = item.city ?? "";
  const recruitmentTarget = item.recruitmentTargetFarewell ?? item.recruitmentTarget ?? "";
  const recruitmentBatch = item.recruitmentTargetEducationBackground ?? item.recruitmentBatch ?? "";
  const businessType = item.businessType ?? "";
  const ndustryCategory = item.ndustryCategory ?? "";
  const deadline = item.deadline ?? "";
  const referralCode = item.referralCode ?? "";
  const note = item.note ?? "";
  const officialAnnouncement = item.officialAnnouncement ?? "";
  const deliveryMethod = item.deliveryMethod ?? "";
  const status = item.status ?? "";
  const updateTime = item.updateTime ?? "";

  return {
    id: item.id,
    jobId: item.id,
    company,
    position,
    role: position,
    ndustryCategory,
    industry: ndustryCategory,
    businessType,
    companyType: businessType,
    city,
    recruitmentTarget,
    graduation: recruitmentTarget,
    graduationYear: recruitmentTarget,
    recruitmentBatch,
    batch: recruitmentBatch,
    positionCategory: ndustryCategory,
    programTitle: "",
    recruitmentTime: updateTime,
    updateTime,
    salaryText: "",
    targetAudience: recruitmentTarget,
    referralCode,
    referralNote: note,
    deliveryMethod,
    entryUrl: deliveryMethod,
    officialApplyUrl: deliveryMethod,
    applyUrl: deliveryMethod,
    officialAnnouncement,
    notice: officialAnnouncement || note,
    note,
    status,
    duties: "",
    requirements: "",
    education: recruitmentTarget,
    major: ndustryCategory,
    exam: "未提供",
    deadline,
    tags: [recruitmentTarget, recruitmentBatch, ndustryCategory, city, businessType, status].filter(Boolean),
    favorite: false,
  };
}

async function loadCampusRecruitmentJobs(params = {}, options = {}) {
  const page = await getCampusRecruitmentList(params, options);
  const jobs = (page.content ?? []).map(makeCampusRecruitmentJob);
  return { jobs, page };
}

async function loadInternshipJobs(params = {}, options = {}) {
  const page = await getInternshipList(params, options);
  const jobs = (page.content ?? []).map(makeCampusRecruitmentJob);
  return { jobs, page };
}

/**
 * 文档精准匹配的服务端分页加载：切换页码时按 pageNum/pageSize 重新请求后端，
 * 返回结构与其它 loadJobs 一致 {jobs, page}。
 */
async function loadDocumentMatchJobs(file, params = {}, options = {}) {
  if (!file) throw new Error("简历文件已丢失，请重新上传并匹配。");
  const page = Number(params.page ?? 1);
  const size = Number(params.size ?? 10);
  const result = await searchCampusRecruitmentByDocument(
    { page, pageSize: size, file },
    options,
  );
  const list = Array.isArray(result?.list) ? result.list : [];
  const jobs = list.map(makeCampusRecruitmentJob);
  const total = Number(result?.total ?? list.length);
  return {
    jobs,
    page: {
      number: Number(result?.pageNum ?? page),
      size: Number(result?.pageSize ?? size),
      totalElements: total,
      totalPages: Math.max(1, Math.ceil(total / size)),
    },
  };
}

function normalizeRecruitmentPage(result) {
  if (Array.isArray(result?.content)) return result;
  return { content: [], number: 0, size: 10, totalElements: 0, totalPages: 0 };
}

function buildRecruitmentQuery(params = {}) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === null || value === undefined || value === "") return;
    search.set(key, String(value));
  });
  const query = search.toString();
  return query ? `?${query}` : "";
}

async function getInternshipRecommendationPage(params = {}, { signal } = {}) {
  const page = Number(params.page ?? 0);
  const normalizedParams = {
    ...params,
    page: Number.isFinite(page) && page >= 0 ? page : 0,
    size: Number(params.size ?? 10),
  };
  const response = await fetch(`/api/recruitment/positions/internship/recommend${buildRecruitmentQuery(normalizedParams)}`, {
    credentials: "include",
    headers: { Accept: "application/json" },
    signal,
  });
  if (!response.ok) throw new Error(`实习智能推荐接口请求失败：HTTP ${response.status}`);
  return normalizeRecruitmentPage(await response.json());
}

async function loadRecruitmentRecommendations(marketType, params = {}, options = {}) {
  if (marketType === "campus") {
    return loadCampusRecruitmentJobs(params, options);
  }
  const page = marketType === "internship"
    ? await getInternshipRecommendationPage(params, options)
    : await getRecruitmentRecommendationPage(params, options);
  const dataset = {
    categories: [],
    companies: [],
    positions: page.content ?? [],
    referralCodes: [],
  };
  const jobs = (dataset.positions ?? [])
    .map((position) => makeRecruitmentJob(position, dataset, marketType));
  return { jobs, page };
}

const campusMarketConfig = {
  type: "campus",
  tone: "campus",
  ariaLabel: "校招信息库页面",
  eyebrow: "校招信息库",
  title: "每天更新校招岗位，不再错过关键批次",
  description: "集中查看秋招、春招、提前批和补录信息，按招聘对象、城市和截止时间精准筛选。",
  primaryAction: "手动添加校招岗位",
  newEntryPath: "/campus/new",
  sourceLabel: "局域网后端校招数据接口",
  loadJobs: (params, options) => loadCampusRecruitmentJobs(params, options),
  stats: (jobs, pageInfo) => [
    { label: "已收录企业", value: new Set(jobs.map((job) => job.company)).size, hint: "覆盖不同企业类型", icon: "企" },
    { label: "校招岗位", value: pageInfo.totalElements, hint: "来自后端分页接口", icon: "岗" },
    { label: "覆盖城市", value: new Set(jobs.map((job) => job.city)).size, hint: "工作地点分布", icon: "城" },
    { label: "招聘批次", value: new Set(jobs.map((job) => job.recruitmentBatch)).size, hint: "提前批、秋招、春招与补录", icon: "批" },
    { label: "可投递岗位", value: jobs.filter((job) => new Date(job.deadline) >= new Date("2026-07-15")).length, hint: "截止时间仍有效", icon: "投" },
  ],
  shortcuts: [],
  advantages: ["每日更新", "覆盖秋招、春招和补录", "按招聘对象精准筛选", "一键加入投递管理"],
  quickFilters: ["提前批", "秋招", "春招", "补录", "可投递", "近7天截止"],
  searchPlaceholder: "搜索公司、岗位、行业、城市、关键词",
  initialFilters: {
    recruitmentTarget: "",
    position: "",
    city: "",
    recruitmentBatch: "",
    businessType: "",
  },
  filters: [
    { key: "recruitmentTarget", label: "届别", options: ["2027届", "2026届"] },
    { key: "position", label: "岗位方向", options: ["互联网与技术", "产品与设计"] },
    { key: "city", label: "城市", options: ["北京", "上海", "广州", "深圳", "成都", "重庆", "杭州", "南京", "武汉"] },
    { key: "recruitmentBatch", label: "学历", options: ["本科", "硕士", "博士"] },
    { key: "businessType", label: "企业性质", options: ["央国企", "国企", "央企", "民企", "外企", "事业单位", "研究所", "其他"] },
  ],
  columns:
    [{ label: "公司", render: (job) => <JobTitleCell title={job.company} badge={job.officialAnnouncement} /> },
    { label: "岗位", render: (job) => <div className="market-two-line"><ExpandableList text={job.position} maxItems={3} /></div> },
    { label: "企业性质", render: (job) => <TwoLine primary={job.businessType} /> },
    { label: "城市", render: (job) => <CityCell city={job.city} /> },
    { label: "学历要求", render: (job) => <TwoLine primary={job.recruitmentTarget} /> },
    { label: "截止时间", render: (job) => <span className="market-pill blue" title="截止时间" aria-label="截止时间">{job.deadline}</span> },
    { label: "详情", render: (job, openDetail) => <button className="market-pill blue" type="button" onClick={() => openDetail(job)} title="查看岗位详情" aria-label="查看岗位详情">查看岗位详情</button> },
    { label: "一键投递", render: (job) => (isExternalUrl(job.deliveryMethod) ? (<a href={job.deliveryMethod} target="_blank" rel="noopener noreferrer">投递入口</a>) : (job.deliveryMethod || "未提供")) },
    { label: "内推码", render: (job) => <span className="market-pill purple">{job.referralCode || "无"}</span> }],
  detailRows: [
    ["公司名称", "company"], ["岗位名称", "position"], ["行业分类", "ndustryCategory"], ["业务类型", "businessType"],
    ["工作地点", "city"], ["招聘对象", "recruitmentTarget"], ["招聘批次", "recruitmentBatch"], ["状态", "status"],
    ["截止时间", "deadline"], ["更新时间", "updateTime"], ["投递方式", "deliveryMethod"], ["内推码", "referralCode"],
    ["招聘公告", "officialAnnouncement"], ["备注", "note"],
    ["岗位职责", "duties"], ["任职要求", "requirements"], ["成长空间", "growth"],
  ],
  cardMeta: (job) => [job.city, job.recruitmentTarget, job.recruitmentBatch, job.businessType, formatDateLabel(job.deadline)],
  searchText: (job) => [job.company, job.position, job.ndustryCategory, job.businessType, job.city, job.recruitmentTarget, job.recruitmentBatch, job.referralCode, job.note, job.officialAnnouncement].join(" "),
  matchesQuickFilter(job, tag) {
    if (tag === "可投递") return new Date(job.deadline) >= new Date("2026-07-15");
    if (tag === "近7天截止") return daysUntil(job.deadline) <= 7;
    return job.tags.includes(tag) || job.recruitmentBatch === tag;
  },
  matchesAdvanced(job, filters) {
    return Object.entries(filters).every(([key, value]) => {
      if (!value) return true;
      return String(job[key] ?? "").includes(value);
    });
  },
  formFields: [
    ["company", "公司名称", "text"], ["position", "岗位名称", "text"],
    ["ndustryCategory", "行业分类", "text"], ["businessType", "业务类型", "text"],
    ["city", "工作地点", "text"], ["recruitmentTarget", "招聘对象", "text"],
    ["recruitmentBatch", "学历", "select", ["本科", "硕士", "博士"]],
    ["deadline", "截止日期", "date"], ["deliveryMethod", "投递方式", "url"],
    ["referralCode", "内推码", "text"], ["officialAnnouncement", "招聘公告", "textarea"], ["note", "备注", "textarea"],
  ],
  createJob(form) {
    return {
      id: `campus-local-${Date.now()}`,
      company: form.company,
      position: form.position,
      role: form.position,
      ndustryCategory: form.ndustryCategory,
      industry: form.ndustryCategory,
      businessType: form.businessType,
      companyType: form.businessType,
      city: form.city,
      recruitmentTarget: form.recruitmentTarget,
      graduation: form.recruitmentTarget,
      graduationYear: form.recruitmentTarget,
      recruitmentBatch: form.recruitmentBatch,
      batch: form.recruitmentBatch,
      deadline: form.deadline,
      deliveryMethod: form.deliveryMethod,
      entryUrl: form.deliveryMethod,
      officialApplyUrl: form.deliveryMethod,
      applyUrl: form.deliveryMethod,
      referralCode: form.referralCode,
      referralNote: form.note,
      officialAnnouncement: form.officialAnnouncement,
      notice: form.officialAnnouncement || form.note || "本地临时记录，等待后端保存接口接入。",
      note: form.note,
      status: "本地记录",
      updateTime: "",
      duties: "",
      requirements: "",
      education: form.recruitmentTarget,
      major: form.ndustryCategory,
      exam: "未提供",
      tags: [form.recruitmentTarget, form.recruitmentBatch, form.ndustryCategory, form.city, form.businessType].filter(Boolean),
      favorite: false,
    };
  },
};

const internshipMarketConfig = {
  type: "internship",
  tone: "internship",
  ariaLabel: "实习信息库页面",
  eyebrow: "实习信息库",
  title: "精选优质实习岗位，提前积累职场竞争力",
  description: "集中查看实习岗位信息，按招聘对象、城市和截止时间精准筛选。",
  primaryAction: "手动添加实习岗位",
  newEntryPath: "/internships/new",
  sourceLabel: "局域网后端实习数据接口",
  loadJobs: (params, options) => loadInternshipJobs(params, options),
  stats: (jobs, pageInfo) => [
    { label: "已收录企业", value: new Set(jobs.map((job) => job.company)).size, hint: "覆盖不同企业类型", icon: "企" },
    { label: "实习岗位", value: pageInfo.totalElements, hint: "来自后端分页接口", icon: "习" },
    { label: "覆盖城市", value: new Set(jobs.map((job) => job.city)).size, hint: "工作地点分布", icon: "城" },
    { label: "招聘批次", value: new Set(jobs.map((job) => job.recruitmentBatch)).size, hint: "提前批、秋招、春招与补录", icon: "批" },
    { label: "可投递岗位", value: jobs.filter((job) => new Date(job.deadline) >= new Date("2026-07-15")).length, hint: "截止时间仍有效", icon: "投" },
  ],
  shortcuts: [],
  advantages: ["每日更新", "覆盖日常实习与暑期实习", "按招聘对象精准筛选", "一键加入投递管理"],
  quickFilters: ["可投递", "近7天截止"],
  searchPlaceholder: "搜索公司、岗位、行业、城市、关键词",
  initialFilters: {
    recruitmentTarget: "",
    position: "",
    city: "",
    recruitmentBatch: "",
    businessType: "",
  },
  filters: [
    { key: "recruitmentTarget", label: "届别", options: ["2027届", "2026届"] },
    { key: "position", label: "岗位方向", options: ["互联网与技术", "产品与设计"] },
    { key: "city", label: "城市", options: ["北京", "上海", "广州", "深圳", "成都", "重庆", "杭州", "南京", "武汉"] },
    { key: "recruitmentBatch", label: "学历", options: ["本科", "硕士", "博士"] },
    { key: "businessType", label: "企业性质", options: ["央国企", "国企", "央企", "民企", "外企", "事业单位", "研究所", "其他"] },
  ],
  columns: [
    { label: "公司", render: (job) => <JobTitleCell title={job.company} badge={job.officialAnnouncement} /> },
    { label: "岗位", render: (job) => <div className="market-two-line"><ExpandableList text={job.position} maxItems={3} /></div> },
    { label: "企业性质", render: (job) => <TwoLine primary={job.businessType} /> },
    { label: "城市", render: (job) => <CityCell city={job.city} /> },
    { label: "学历要求", render: (job) => <TwoLine primary={job.recruitmentTarget} /> },
    { label: "截止时间", render: (job) => <span className="market-pill blue" title="截止时间" aria-label="截止时间">{job.deadline}</span> },
    { label: "详情", render: (job, openDetail) => <button className="market-pill blue" type="button" onClick={() => openDetail(job)} title="查看岗位详情" aria-label="查看岗位详情">查看岗位详情</button> },
    { label: "一键投递", render: (job) => (isExternalUrl(job.deliveryMethod) ? (<a href={job.deliveryMethod} target="_blank" rel="noopener noreferrer">投递入口</a>) : (job.deliveryMethod || "未提供")) },
    { label: "内推码", render: (job) => <span className="market-pill purple">{job.referralCode || "无"}</span> },
  ],
  detailRows: [
    ["公司名称", "company"], ["岗位名称", "position"], ["行业分类", "ndustryCategory"], ["业务类型", "businessType"],
    ["工作地点", "city"], ["招聘对象", "recruitmentTarget"], ["招聘批次", "recruitmentBatch"], ["状态", "status"],
    ["截止时间", "deadline"], ["更新时间", "updateTime"], ["投递方式", "deliveryMethod"], ["内推码", "referralCode"],
    ["招聘公告", "officialAnnouncement"], ["备注", "note"],
    ["岗位职责", "duties"], ["任职要求", "requirements"], ["成长空间", "growth"],
  ],
  cardMeta: (job) => [job.city, job.recruitmentTarget, job.recruitmentBatch, job.businessType, formatDateLabel(job.deadline)],
  searchText: (job) => [job.company, job.position, job.ndustryCategory, job.businessType, job.city, job.recruitmentTarget, job.recruitmentBatch, job.referralCode, job.note, job.officialAnnouncement].join(" "),
  matchesQuickFilter(job, tag) {
    if (tag === "可投递") return new Date(job.deadline) >= new Date("2026-07-15");
    if (tag === "近7天截止") return daysUntil(job.deadline) <= 7;
    return job.tags.includes(tag) || job.recruitmentBatch === tag;
  },
  matchesAdvanced(job, filters) {
    return Object.entries(filters).every(([key, value]) => {
      if (!value) return true;
      return String(job[key] ?? "").includes(value);
    });
  },
  formFields: [
    ["company", "公司名称", "text"], ["position", "岗位名称", "text"],
    ["ndustryCategory", "行业分类", "text"], ["businessType", "业务类型", "text"],
    ["city", "工作地点", "text"], ["recruitmentTarget", "招聘对象", "text"],
    ["recruitmentBatch", "学历", "select", ["本科", "硕士", "博士"]],
    ["deadline", "截止日期", "date"], ["deliveryMethod", "投递方式", "url"],
    ["referralCode", "内推码", "text"], ["officialAnnouncement", "招聘公告", "textarea"], ["note", "备注", "textarea"],
  ],
  createJob(form) {
    return {
      id: `intern-local-${Date.now()}`,
      company: form.company,
      position: form.position,
      role: form.position,
      ndustryCategory: form.ndustryCategory,
      industry: form.ndustryCategory,
      businessType: form.businessType,
      companyType: form.businessType,
      city: form.city,
      recruitmentTarget: form.recruitmentTarget,
      graduation: form.recruitmentTarget,
      graduationYear: form.recruitmentTarget,
      recruitmentBatch: form.recruitmentBatch,
      batch: form.recruitmentBatch,
      deadline: form.deadline,
      deliveryMethod: form.deliveryMethod,
      entryUrl: form.deliveryMethod,
      officialApplyUrl: form.deliveryMethod,
      applyUrl: form.deliveryMethod,
      referralCode: form.referralCode,
      referralNote: form.note,
      officialAnnouncement: form.officialAnnouncement,
      notice: form.officialAnnouncement || form.note || "本地临时记录，等待后端保存接口接入。",
      note: form.note,
      status: "本地记录",
      updateTime: "",
      duties: "",
      requirements: "",
      education: form.recruitmentTarget,
      major: form.ndustryCategory,
      exam: "未提供",
      tags: [form.recruitmentTarget, form.recruitmentBatch, form.ndustryCategory, form.city, form.businessType].filter(Boolean),
      favorite: false,
    };
  },
};

function RecruitingMarketPage({ config, navigate }) {
  const isCampus = config.type === "campus";
  const jobMatchType = isCampus ? "CAMPUS" : "INTERNSHIP";
  const isRecruitingCompact = config.type === "campus" || config.type === "internship";
  const [jobs, setJobs] = useState([]);
  const [pageInfo, setPageInfo] = useState({ number: 0, size: 10, totalElements: 0, totalPages: 1 });
  const [jobsLoading, setJobsLoading] = useState(true);
  const [jobsError, setJobsError] = useState("");
  const [reloadToken, setReloadToken] = useState(0);
  const [query, setQuery] = useState("");
  const [quickTags, setQuickTags] = useState([]);
  const [filters, setFilters] = useState(config.initialFilters);
  const [draftFilters, setDraftFilters] = useState(config.initialFilters);
  const [view, setView] = useState(() => (window.matchMedia?.("(max-width: 760px)").matches ? "cards" : "table"));
  const [moreFiltersOpen, setMoreFiltersOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [modalOpen, setModalOpen] = useState(false);
  const [detailJob, setDetailJob] = useState(null);
  const [form, setForm] = useState(() => createEmptyMarketForm(config));
  const [formError, setFormError] = useState("");
  const [resumeChoices, setResumeChoices] = useState(() => getSessionResumeUploads());
  const [selectedMatchResumeId, setSelectedMatchResumeId] = useState(() => window.sessionStorage.getItem(LAST_UPLOADED_RESUME_KEY) ?? "");
  const [resumeGate, setResumeGate] = useState(null);
  const [resumeGateError, setResumeGateError] = useState("");
  const [resumeGateUploading, setResumeGateUploading] = useState(false);
  const [matchResults, setMatchResults] = useState({});
  const [matchErrors, setMatchErrors] = useState({});
  const [matchLoading, setMatchLoading] = useState(null);
  const [activeMatchReport, setActiveMatchReport] = useState(null);
  const [campusUploadOpen, setCampusUploadOpen] = useState(false);
  const [campusUploadStatus, setCampusUploadStatus] = useState("idle");
  const [campusUploadProgress, setCampusUploadProgress] = useState(0);
  const [campusUploadError, setCampusUploadError] = useState("");
  const [campusMatchError, setCampusMatchError] = useState("");
  const [campusMatching, setCampusMatching] = useState(false);
  const [campusMatchMode, setCampusMatchMode] = useState(false);
  const [campusBatchScores, setCampusBatchScores] = useState({});
  const [jobMatchModalOpen, setJobMatchModalOpen] = useState(false);
  const [jobMatchDraft, setJobMatchDraft] = useState({});
  const [jobMatchSession, setJobMatchSession] = useState(null);
  const [jobMatchItems, setJobMatchItems] = useState([]);
  const [jobMatchNextLoading, setJobMatchNextLoading] = useState(false);
  const [jobMatchReserveLoadingIds, setJobMatchReserveLoadingIds] = useState({});
  const [jobMatchTargetJobId, setJobMatchTargetJobId] = useState("");
  const [jobMatchError, setJobMatchError] = useState("");
  const [documentMatchMode, setDocumentMatchMode] = useState(false);
  const matchAbortRef = useRef(null);
  const resumeFilesRef = useRef(new Map());
  const matchFileRef = useRef(null);
  const matchLoadedPageRef = useRef(1);
  const pageSize = 10;
  const requestParams = useMemo(() => {
    const params = {
      page,
      size: pageSize,
    };
    params.recruitmentType = config.type === "campus" ? "CAMPUS" : "INTERNSHIP";
    params.jobType = config.type === "campus" ? "CAMPUS" : "INTERNSHIP";
    const normalizedQuery = query.trim();
    const filterTerms = Object.values(filters).filter(Boolean);
    if (normalizedQuery) params.q = normalizedQuery;
    if (quickTags.length > 0) params.tags = quickTags.join(",");
    if (config.type !== "internship" && filterTerms.length > 0 && !params.q) params.q = filterTerms.join(" ");
    Object.entries(filters).forEach(([key, value]) => {
      if (value) params[key] = value;
    });
    return params;
  }, [config.type, filters, page, quickTags, query]);

  useEffect(() => {
    const controller = new AbortController();
    setJobsLoading(true);
    setJobsError("");

    let request;
    if (documentMatchMode) {
      // 匹配完成后已加载第 1 页，跳过这次由状态变化触发的重复请求；
      // 仅在用户点击页码（page 变化）时才按 pageNum/pageSize 重新请求后端。
      const targetPage = Number(requestParams.page ?? 1);
      if (targetPage === matchLoadedPageRef.current) {
        setJobsLoading(false);
        return undefined;
      }
      matchLoadedPageRef.current = targetPage;
      request = loadDocumentMatchJobs(matchFileRef.current, requestParams, { signal: controller.signal });
    } else {
      request = config.loadJobs(requestParams, { signal: controller.signal });
    }

    request
      .then((result) => {
        if (controller.signal.aborted) return;
        const nextPage = result?.page ?? {};
        setJobs(Array.isArray(result?.jobs) ? result.jobs : []);
        setPageInfo({
          number: Number(nextPage.number ?? requestParams.page ?? 0),
          size: Number(nextPage.size ?? pageSize),
          totalElements: Number(nextPage.totalElements ?? result?.jobs?.length ?? 0),
          totalPages: Math.max(1, Number(nextPage.totalPages ?? 1)),
        });
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        setJobsError(error.message || "无法连接招聘数据服务器，请确认服务器电脑、Docker 和后端服务正在运行。");
      })
      .finally(() => {
        if (!controller.signal.aborted) setJobsLoading(false);
      });
    return () => controller.abort();
  }, [config, pageSize, reloadToken, requestParams, documentMatchMode]);

  const filteredJobs = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const nextJobs = jobs.filter((job) => {
      const matchesQuery = !normalizedQuery || config.searchText(job).toLowerCase().includes(normalizedQuery);
      const matchesQuick = quickTags.every((tag) => config.matchesQuickFilter(job, tag));
      return matchesQuery && matchesQuick;
    });
    if (!isRecruitingCompact || !campusMatchMode) return nextJobs;
    return [...nextJobs].sort((first, second) => {
      const firstScore = getOverallScore(campusBatchScores[first.id]) ?? -1;
      const secondScore = getOverallScore(campusBatchScores[second.id]) ?? -1;
      return secondScore - firstScore;
    });
  }, [jobs, query, quickTags, config, isRecruitingCompact, campusMatchMode, campusBatchScores]);

  // 当后端只返回一页（totalPages<=1，如推荐/平面列表）时按本地切片分页；
  // 否则依赖后端返回的 totalPages 做服务端分页（此时 jobs 已是当前页数据）。
  const isLocalPaging = pageInfo.totalPages <= 1;
  const localTotalPages = isLocalPaging ? Math.ceil(filteredJobs.length / pageSize) : pageInfo.totalPages;
  const totalPages = Math.max(1, localTotalPages);
  const currentPage = Math.min(page, totalPages);
  const pageJobs = isLocalPaging
    ? filteredJobs.slice((page - 1) * pageSize, page * pageSize)
    : filteredJobs.slice(0, pageSize);
  const showJobMatchResults = Boolean(jobMatchSession && jobMatchItems.length > 0);
  const visibleColumns = useMemo(() => config.columns, [config.columns]);
  const campusMainFilters = config.filters;
  const paginationItems = useMemo(() => {
    const items = [];
    const last = totalPages;
    const current = currentPage;
    items.push(1);
    const start = Math.max(2, current - 2);
    const end = Math.min(last - 1, current + 2);
    if (start > 2) items.push("ellipsis");
    for (let value = start; value <= end; value += 1) items.push(value);
    if (end < last - 1) items.push("ellipsis");
    if (last > 1) items.push(last);
    return items;
  }, [totalPages, currentPage]);

  useEffect(() => {
    if (!modalOpen && !detailJob && !resumeGate && !activeMatchReport && !campusUploadOpen) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.body.classList.add("market-modal-open");
    function handleKeyDown(event) {
      if (event.key === "Escape") {
        setModalOpen(false);
        setDetailJob(null);
        setResumeGate(null);
        setActiveMatchReport(null);
        setCampusUploadOpen(false);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      document.body.classList.remove("market-modal-open");
    };
  }, [modalOpen, detailJob, resumeGate, activeMatchReport, campusUploadOpen]);

  useEffect(() => () => matchAbortRef.current?.abort(), []);

  function updateFilter(key, value) {
    setPage(1);
    setFilters((current) => ({ ...current, [key]: value }));
  }

  function updateDraftFilter(key, value) {
    setDraftFilters((current) => ({ ...current, [key]: value }));
  }

  function applyFilters() {
    setCampusMatchError("");
    setPage(1);
    setFilters(draftFilters);
  }

  function toggleQuickTag(tag) {
    setPage(1);
    setQuickTags((current) => (
      current.includes(tag) ? current.filter((item) => item !== tag) : [...current, tag]
    ));
  }

  function resetFilters() {
    setDocumentMatchMode(false);
    setPage(1);
    setQuery("");
    setQuickTags([]);
    setDraftFilters(config.initialFilters);
    setFilters(config.initialFilters);
  }

  function openAddModal() {
    if (config.newEntryPath && navigate) {
      navigate(config.newEntryPath);
      return;
    }
    setForm(createEmptyMarketForm(config));
    setFormError("");
    setModalOpen(true);
  }

  function getJobTypeForApi() {
    return config.type === "campus" ? "CAMPUS" : "INTERNSHIP";
  }

  function getMatchKey(job, resumeId = selectedMatchResumeId) {
    return `${config.type}:${job.id}:${resumeId || "no-resume"}`;
  }

  function getResolvedResumeId() {
    const sessionId = window.sessionStorage.getItem(LAST_UPLOADED_RESUME_KEY);
    if (selectedMatchResumeId && resumeChoices.some((resume) => resume.id === selectedMatchResumeId)) return selectedMatchResumeId;
    if (sessionId && resumeChoices.some((resume) => resume.id === sessionId)) return sessionId;
    return resumeChoices[0]?.id ?? "";
  }

  function getResumeName(resumeId) {
    return resumeChoices.find((resume) => resume.id === resumeId)?.fileName ?? "未选择简历";
  }

  function getMatchButtonState(job) {
    return { label: "匹配度", tone: "ready" };
  }

  function buildJobRequirement(job) {
    const lines = [];
    const push = (label, ...values) => {
      const text = firstAvailable(...values);
      if (text) lines.push(`${label}：${text}`);
    };
    push("公司", job.company);
    push("岗位", job.role, job.position);
    push("工作城市", job.city);
    push("招聘对象", job.recruitmentTarget);
    push("招聘批次", job.recruitmentBatch, job.batch);
    push("企业性质", job.businessType, job.companyType);
    push("行业方向", job.ndustryCategory, job.positionCategory, job.industry);
    push("学历要求", job.education);
    push("专业要求", job.major);
    push("投递方式", job.deliveryMethod);
    push("岗位说明", job.officialAnnouncement, job.notice, job.note);
    return lines.length > 0 ? lines.join("\n") : `${job.company} · ${job.role || job.position}`;
  }

  function openResumeGate(job, intent) {
    setResumeChoices([]);
    setSelectedMatchResumeId("");
    setResumeGate({ job, intent });
    setResumeGateError("");
  }

  function handleMatchClick(job) {
    openResumeGate(job, "match");
  }

  function handleOptimizeClick(job) {
    const resumeId = getResolvedResumeId();
    if (!resumeId) {
      openResumeGate(job, "optimize");
      return;
    }
    navigateToResumeOptimization(job, resumeId);
  }

  function navigateToResumeOptimization(job, resumeId) {
    const params = new URLSearchParams({
      mode: "optimize",
      jobType: config.type,
      jobId: String(job.id),
      resumeId,
    });
    navigate(`/dashboard?${params.toString()}`);
  }

  function getJobMatchPositionId(job) {
    return String(job?.jobId ?? job?.id ?? job?.positionId ?? "").trim();
  }

  function openJobMatchModal(job = null) {
    const targetJobId = getJobMatchPositionId(job);
    const nextResumeId = getResolvedResumeId();
    const nextDraft = {
      targetRoles: [job?.role].filter(Boolean),
      cities: [job?.city].filter(Boolean),
      graduation: job?.graduation ?? "",
      recruitmentBatch: job?.batch ?? "",
      companyType: job?.companyType ?? "",
      industry: job?.industry ?? "",
      education: job?.education ?? "",
      keywords: job?.role ?? "",
      jobId: targetJobId,
      recruitmentType: jobMatchType,
      resumeId: nextResumeId,
      onlyUnexpired: true,
      acceptWrittenTest: "",
      acceptRelatedJobs: "",
    };
    setJobMatchTargetJobId(targetJobId);
    setJobMatchDraft(nextDraft);
    setJobMatchError("");
    setJobMatchModalOpen(true);
    if (nextResumeId) setSelectedMatchResumeId(nextResumeId);
  }

  function closeJobMatchModal() {
    setJobMatchModalOpen(false);
    setJobMatchTargetJobId("");
  }

  function handleJobMatchComplete(summary) {
    const list = Array.isArray(summary?.results) ? summary.results : [];
    const total = Number(summary?.total ?? list.length);
    const matchedJobs = list.map(makeCampusRecruitmentJob);
    // 记住简历文件与已加载页码，供切换页码时按 pageNum/pageSize 向后端重新请求
    matchFileRef.current = summary?.file ?? null;
    matchLoadedPageRef.current = 1;
    setDocumentMatchMode(true);
    setPage(1);
    setQuery("");
    setQuickTags([]);
    setFilters(config.initialFilters);
    setJobs(matchedJobs);
    setPageInfo({
      number: 0,
      size: pageSize,
      totalElements: total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    });
    setJobsLoading(false);
    setJobsError("");
    setJobMatchModalOpen(false);
    setJobMatchTargetJobId("");
  }

  async function handleJobMatchNextBatch() {
    if (!jobMatchSession?.sessionId || jobMatchNextLoading) return;
    setJobMatchNextLoading(true);
    try {
      const response = await getJobMatchNextBatch(jobMatchSession.sessionId);
      const nextItems = Array.isArray(response?.results) ? response.results : Array.isArray(response?.items) ? response.items : [];
      const nextSession = response?.session ?? response ?? {};
      setJobMatchItems(nextItems);
      setJobMatchSession((current) => ({
        ...(current ?? {}),
        ...nextSession,
        sessionId: nextSession.sessionId ?? current?.sessionId ?? jobMatchSession.sessionId,
      }));
    } catch (error) {
      setJobMatchError(error.message || "换一批失败，请稍后重试。");
    } finally {
      setJobMatchNextLoading(false);
    }
  }

  function handleJobMatchRematch() {
    setJobMatchModalOpen(true);
    setJobMatchTargetJobId(jobMatchSession?.jobId ?? jobMatchTargetJobId);
    setJobMatchDraft((current) => ({
      ...(current ?? {}),
      recruitmentType: jobMatchType,
      resumeId: jobMatchSession?.resumeId ?? current?.resumeId ?? selectedMatchResumeId,
    }));
  }

  function handleJobMatchExit() {
    setJobMatchSession(null);
    setJobMatchItems([]);
    setJobMatchError("");
  }

  async function handleJobMatchReserveToggle(item) {
    const positionId = String(item?.positionId ?? item?.job?.positionId ?? item?.id ?? item?.job?.id ?? item?.sourceKey ?? item?.job?.sourceKey ?? "").trim();
    if (!positionId || !jobMatchSession?.sessionId) return;
    const reserved = Boolean(item?.reserved);
    setJobMatchReserveLoadingIds((current) => ({ ...current, [positionId]: true }));
    try {
      if (reserved) {
        await cancelJobMatchReservation(positionId);
      } else {
        await reserveJobMatchPosition(positionId, jobMatchSession.sessionId);
      }
      setJobMatchItems((current) => current.map((currentItem) => {
        const currentId = String(currentItem?.positionId ?? currentItem?.job?.positionId ?? currentItem?.id ?? currentItem?.job?.id ?? currentItem?.sourceKey ?? currentItem?.job?.sourceKey ?? "").trim();
        if (currentId !== positionId) return currentItem;
        return { ...currentItem, reserved: !reserved };
      }));
    } catch (error) {
      setJobMatchError(error.message || "保留岗位操作失败，请稍后重试。");
    } finally {
      setJobMatchReserveLoadingIds((current) => ({ ...current, [positionId]: false }));
    }
  }

  async function uploadResumeForGate(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    const validationError = validateResumeFile(file);
    if (validationError) {
      setResumeGateError(validationError);
      return;
    }

    setResumeGateUploading(true);
    setResumeGateError("");
    try {
      const uploadResult = await uploadResumeFile(file);
      const record = createResumeRecord(file.name, file, uploadResult);
      resumeFilesRef.current.set(record.id, file);
      setResumeChoices([record]);
      setSelectedMatchResumeId(record.id);
    } catch {
      setResumeGateError("简历上传失败，请重试。");
    } finally {
      setResumeGateUploading(false);
    }
  }

  async function uploadCampusResume(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    const validationError = validateResumeFile(file);
    if (validationError) {
      setCampusUploadStatus("error");
      setCampusUploadError(validationError);
      return;
    }

    const existingNames = resumeChoices.map((resume) => resume.fileName);
    const duplicate = existingNames.some((name) => name.toLowerCase() === file.name.toLowerCase());
    const nextFileName = duplicate ? createRenamedFileName(file.name, existingNames) : file.name;

    setCampusUploadStatus("uploading");
    setCampusUploadProgress(0);
    setCampusUploadError("");
    try {
      const uploadResult = await uploadResumeFile(file, {
        onProgress: setCampusUploadProgress,
        onParsing: () => setCampusUploadProgress((value) => Math.max(value, 82)),
      });
      const record = createResumeRecord(nextFileName, file, uploadResult);
      resumeFilesRef.current.set(record.id, file);
      const nextResumes = [record, ...resumeChoices];
      saveSessionResumeUploads(nextResumes);
      window.sessionStorage.setItem(LAST_UPLOADED_RESUME_KEY, record.id);
      setResumeChoices(nextResumes);
      setSelectedMatchResumeId(record.id);
      setCampusUploadProgress(100);
      setCampusUploadStatus("success");
      setCampusMatchError("");
    } catch (error) {
      setCampusUploadStatus("error");
      setCampusUploadError(error.message || "简历上传失败，请重试。");
    }
  }

  function toBatchMatchJob(job) {
    return {
      jobId: job.id,
      companyName: job.company,
      positionName: job.role,
      industry: job.industry,
      location: job.city,
      education: job.education,
      major: job.major,
      description: job.duties || job.notice,
      requirements: job.requirements || job.education || job.major,
    };
  }

  async function runCampusBatchMatch() {
    const resumeId = getResolvedResumeId();
    if (!resumeId) {
      setCampusMatchError("请先上传简历");
      setCampusUploadOpen(true);
      return;
    }
    const candidates = filteredJobs.slice(0, 20);
    if (candidates.length === 0) {
      setCampusMatchError("暂无可用于匹配的岗位，请调整搜索或筛选条件。");
      return;
    }

    matchAbortRef.current?.abort();
    const controller = new AbortController();
    matchAbortRef.current = controller;
    setCampusMatching(true);
    setCampusMatchError("");
    try {
      const response = await analyzeJobBatchMatch({
        resumeId,
        jobs: candidates.map(toBatchMatchJob),
      }, { signal: controller.signal });
      const results = Array.isArray(response?.results) ? response.results : [];
      const nextScores = {};
      const nextMatchResults = {};
      results.forEach((result) => {
        const jobId = result?.jobId ?? result?.job_id;
        if (!jobId) return;
        nextScores[jobId] = result;
        nextMatchResults[getMatchKey({ id: jobId }, resumeId)] = result;
      });
      setCampusBatchScores(nextScores);
      setMatchResults((current) => ({ ...current, ...nextMatchResults }));
      setCampusMatchMode(true);
      setPage(1);
    } catch (error) {
      if (controller.signal.aborted) return;
      setCampusMatchError(error.message || "AI 正在为你匹配岗位失败，请稍后重试。");
    } finally {
      if (!controller.signal.aborted) {
        setCampusMatching(false);
        matchAbortRef.current = null;
      }
    }
  }

  async function confirmResumeGate({ force = false } = {}) {
    if (!resumeGate) return;
    const resumeId = selectedMatchResumeId || getResolvedResumeId();
    if (!resumeId) {
      setResumeGateError("完成岗位匹配前，请先上传或创建一份简历。");
      return;
    }
    window.sessionStorage.setItem(LAST_UPLOADED_RESUME_KEY, resumeId);
    setSelectedMatchResumeId(resumeId);

    if (resumeGate.intent === "optimize") {
      const job = resumeGate.job;
      setResumeGate(null);
      navigateToResumeOptimization(job, resumeId);
      return;
    }

    await runJobMatch(resumeGate.job, resumeId, { force });
  }

  async function runJobMatch(job, resumeId, { force = false } = {}) {
    const file = resumeFilesRef.current.get(resumeId);
    if (!file) {
      setResumeGateError("该简历仅保存了元信息、缺少原始文件，请重新上传简历后再匹配。");
      return;
    }

    const key = getMatchKey(job, resumeId);
    const requirement = buildJobRequirement(job);

    matchAbortRef.current?.abort();
    const controller = new AbortController();
    matchAbortRef.current = controller;
    setResumeGate(null);
    setMatchErrors((current) => ({ ...current, [key]: "" }));
    setMatchLoading({ job, resumeId });

    try {
      const scoreText = await aiJobMatch({ requirement, file }, { signal: controller.signal });
      const score = parseMatchScore(scoreText);
      if (score == null) {
        throw new Error("AI 返回的分数无法解析，请稍后重试。");
      }
      setMatchResults((current) => ({ ...current, [key]: { score } }));
      setActiveMatchReport({ job, resumeId, score, resumeName: getResumeName(resumeId) });
      resumeFilesRef.current.delete(resumeId);
      setResumeChoices([]);
      setSelectedMatchResumeId("");
    } catch (error) {
      if (controller.signal.aborted) {
        setResumeGate({ job, intent: "match" });
        return;
      }
      const message = error.message || "AI岗位匹配接口调用失败，请稍后重试。";
      setMatchErrors((current) => ({ ...current, [key]: message }));
      setResumeGateError(message);
      setResumeGate({ job, intent: "match" });
    } finally {
      setMatchLoading(null);
      matchAbortRef.current = null;
    }
  }

  function cancelMatch() {
    matchAbortRef.current?.abort();
  }

  function rerunMatchFromReport() {
    if (!activeMatchReport) return;
    setActiveMatchReport(null);
    openResumeGate(activeMatchReport.job, "match");
  }

  function submitJob(event) {
    event.preventDefault();
    const requiredMissing = config.formFields
      .filter(([key, , type]) => type !== "textarea")
      .some(([key]) => !String(form[key] ?? "").trim());
    if (requiredMissing) {
      setFormError("请先补全必填字段，再保存岗位。");
      return;
    }
    if ((form.entryUrl || form.applyUrl) && !/^https?:\/\//i.test(form.entryUrl || form.applyUrl)) {
      setFormError("岗位入口需要以 http:// 或 https:// 开头。");
      return;
    }
    setJobs((current) => [config.createJob(form), ...current]);
    setModalOpen(false);
  }

  return (
    <section className={`market-page market-${config.tone}`} aria-label={config.ariaLabel}>
      <div className={`market-hero ${isRecruitingCompact ? "market-campus-hero" : ""}`}>
        <div>
          <span className="market-eyebrow">{config.eyebrow}</span>
          <h1>{config.title}</h1>
          <p>{config.description}</p>
        </div>
      </div>

      {!isRecruitingCompact && <div className="market-stats-grid">
        {config.stats(jobs, pageInfo).map((stat) => (
          <article className="market-stat-card" key={stat.label}>
            <span className="market-stat-icon">{stat.icon}</span>
            <div>
              <small>{stat.label}</small>
              <strong>{stat.value}</strong>
              <p>{stat.hint}</p>
            </div>
          </article>
        ))}
      </div>}

      {!isRecruitingCompact && config.shortcuts.length > 0 && (
        <div className="market-shortcut-grid">
          {config.shortcuts.map((shortcut) => (
            <button className="market-shortcut-card" key={shortcut.title} type="button">
              <span>{shortcut.icon}</span>
              <div>
                <strong>{shortcut.title}</strong>
                <small>{shortcut.description}</small>
              </div>
              <i aria-hidden="true">→</i>
            </button>
          ))}
        </div>
      )}

      {isRecruitingCompact && (
        <div className="market-filter-panel market-campus-filter-panel">
          <div className="market-campus-tools">
            <div className="campus-ai-hint">
              <span>{isCampus ? "上传简历后，将从全库岗位中智能匹配适合你的岗位" : "上传简历后，将从全库岗位中智能匹配适合你的实习岗位"}</span>
              <i aria-hidden="true">&rarr;</i>
            </div>
            <button className={`campus-match-button ${campusMatching ? "is-loading" : ""}`} type="button" onClick={() => openJobMatchModal()} disabled={campusMatching}>
              <span aria-hidden="true">&uarr;</span>
              {campusMatching ? "匹配中..." : "上传简历并匹配"}
            </button>
          </div>
          {campusMatchError && <p className="campus-inline-error">{campusMatchError}</p>}
          <div className="campus-filter-main">
            {campusMainFilters.map((filter) => (
              filter.type === "text" ? (
                <label key={filter.key}>
                  <span>{filter.label}</span>
                  <input
                    type="text"
                    value={draftFilters[filter.key]}
                    placeholder={filter.placeholder || "输入关键词"}
                    onChange={(event) => updateDraftFilter(filter.key, event.target.value)}
                  />
                </label>
              ) : (
                <FilterSelect
                  key={filter.key}
                  label={filter.label}
                  value={draftFilters[filter.key]}
                  options={filter.options}
                  onChange={(value) => updateDraftFilter(filter.key, value)}
                />
              )
            ))}
          </div>
          <div className="campus-filter-actions">
            <button className="campus-secondary-button" type="button" onClick={resetFilters}>重置筛选</button>
            <button className="campus-recommend-button" type="button" onClick={applyFilters}>查询岗位</button>
          </div>

        </div>
      )}

      {!isRecruitingCompact && <div className="market-filter-panel">
        <div className="market-quick-row">
          {config.quickFilters.map((tag) => (
            <button
              className={quickTags.includes(tag) ? "is-active" : ""}
              key={tag}
              type="button"
              onClick={() => toggleQuickTag(tag)}
            >
              {tag}
            </button>
          ))}
        </div>
        <div className="market-search-row">
          <label className="market-search">
            <span>?</span>
            <input value={query} onChange={(event) => { setPage(1); setQuery(event.target.value); }} placeholder={config.searchPlaceholder} />
          </label>
          <div className="market-view-switch" aria-label="视图切换">
            <button className={view === "table" ? "is-active" : ""} type="button" onClick={() => setView("table")}>表格视图</button>
            <button className={view === "cards" ? "is-active" : ""} type="button" onClick={() => setView("cards")}>卡片视图</button>
          </div>
          <button className="market-reset-button" type="button" onClick={resetFilters}>重置筛选</button>
        </div>
        <div className="market-advanced-grid">
          {config.filters.map((filter) => (
            <label key={filter.key}>
              <span>{filter.label}</span>
              <select value={filters[filter.key]} onChange={(event) => updateFilter(filter.key, event.target.value)}>
                <option value="">全部</option>
                {filter.options.map((option) => {
                  const normalizedOption = normalizeFilterOption(option);
                  return <option key={normalizedOption.value} value={normalizedOption.value}>{normalizedOption.label}</option>;
                })}
              </select>
            </label>
          ))}
          <button className="market-primary-action market-filter-add-button" type="button" onClick={openAddModal}>
            {config.primaryAction}
            <span aria-hidden="true">→</span>
          </button>
        </div>
        <div className="market-result-line">
          显示 {pageJobs.length} / {pageInfo.totalElements} 个岗位
          {quickTags.length > 0 && <span>已选：{quickTags.join("、")}</span>}
        </div>
      </div>}

      {showJobMatchResults ? (
        <JobMatchResultsPanel
          session={jobMatchSession}
          items={jobMatchItems}
          onNextBatch={handleJobMatchNextBatch}
          nextBatchLoading={jobMatchNextLoading}
          onRematch={handleJobMatchRematch}
          onExit={handleJobMatchExit}
          onReserveToggle={handleJobMatchReserveToggle}
          reserveLoadingIds={jobMatchReserveLoadingIds}
          onViewDetails={() => { }}
          onOptimize={(item) => navigateToResumeOptimization({ id: item?.positionId ?? item?.id, role: item?.positionName ?? item?.job?.positionName ?? "" }, jobMatchSession?.resumeId ?? selectedMatchResumeId)}
          onApply={() => { }}
          onAddToTracker={() => { }}
        />
      ) : jobsLoading && jobs.length === 0 ? (
        <div className="market-empty-state market-loading-state">
          <strong>正在加载招聘数据</strong>
          <p>正在通过当前前端开发服务器代理访问局域网 Spring Boot 后端。</p>
        </div>
      ) : jobsError ? (
        <div className="market-empty-state market-error-state">
          <strong>无法连接招聘数据服务器，请确认服务器电脑、Docker 和后端服务正在运行。</strong>
          <p>{jobsError}</p>
          <button type="button" onClick={() => setReloadToken((value) => value + 1)}>重新加载</button>
        </div>
      ) : pageJobs.length === 0 ? (
        <div className="market-empty-state">
          <strong>没有找到匹配岗位</strong>
          <p>可以清空筛选，或手动添加一个本地岗位记录。</p>
          <button type="button" onClick={resetFilters}>清空筛选</button>
        </div>
      ) : isRecruitingCompact || view === "table" ? (
        <div className="market-table-shell">
          <table className="market-table">
            <thead>
              <tr>
                {visibleColumns.map((column) => <th key={column.label}>{column.label}</th>)}
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {pageJobs.map((job) => (
                <tr key={job.id}>
                  {visibleColumns.map((column) => <td key={column.label}>{column.render(job, setDetailJob)}</td>)}
                  <td>
                    <MarketActions
                      job={job}
                      config={config}
                      matchState={getMatchButtonState(job)}
                      onDetail={() => setDetailJob(job)}
                      onMatch={() => handleMatchClick(job)}
                      onJobMatch={() => openJobMatchModal(job)}
                      onOptimize={() => handleOptimizeClick(job)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="market-card-grid">
          {pageJobs.map((job) => (
            <article className="market-job-card" key={job.id}>
              <div>
                <span className="market-card-company">{job.company}</span>
                <h3>{job.role}</h3>
              </div>
              <div className="market-card-meta">
                {config.cardMeta(job).map((item) => <span key={item}>{item}</span>)}
              </div>
              <p>{job.notice || job.duties}</p>
              <MarketActions
                job={job}
                config={config}
                matchState={getMatchButtonState(job)}
                onDetail={() => setDetailJob(job)}
                onMatch={() => handleMatchClick(job)}
                onJobMatch={() => openJobMatchModal(job)}
                onOptimize={() => handleOptimizeClick(job)}
              />
            </article>
          ))}
        </div>
      )}

      {!showJobMatchResults && <div className={`market-pagination ${isRecruitingCompact ? "market-campus-pagination" : ""}`}>
        <button type="button" disabled={currentPage <= 1 || jobsLoading} onClick={() => setPage((value) => Math.max(1, value - 1))}>上一页</button>
        {isRecruitingCompact ? (
          <>
            {paginationItems.map((item, index) => (
              item === "ellipsis"
                ? <span className="pagination-ellipsis" key={`ellipsis-${index}`}>...</span>
                : (
                  <button
                    className={currentPage === item ? "is-active" : ""}
                    key={item}
                    type="button"
                    disabled={jobsLoading}
                    onClick={() => setPage(item)}
                  >
                    {item}
                  </button>
                )
            ))}
          </>
        ) : (
          <span>{currentPage} / {totalPages}</span>
        )}
        <button type="button" disabled={currentPage >= totalPages || jobsLoading} onClick={() => setPage((value) => Math.min(totalPages, value + 1))}>下一页</button>
      </div>}

      {modalOpen && (
        <MarketModal title={config.primaryAction} onClose={() => setModalOpen(false)}>
          <form className="market-form" onSubmit={submitJob}>
            {formError && <p className="market-form-error">{formError}</p>}
            <div className="market-form-grid">
              {config.formFields.map(([key, label, type, options]) => (
                <label className={type === "textarea" ? "is-wide" : ""} key={key}>
                  <span>{label}</span>
                  {type === "select" ? (
                    <select value={form[key]} onChange={(event) => setForm((current) => ({ ...current, [key]: event.target.value }))}>
                      <option value="">请选择</option>
                      {options.map((option) => <option key={option} value={option}>{option}</option>)}
                    </select>
                  ) : type === "textarea" ? (
                    <textarea value={form[key]} onChange={(event) => setForm((current) => ({ ...current, [key]: event.target.value }))} />
                  ) : (
                    <input type={type} value={form[key]} onChange={(event) => setForm((current) => ({ ...current, [key]: event.target.value }))} />
                  )}
                </label>
              ))}
            </div>
            <div className="market-form-note">当前保存为本地临时记录，尚未写入数据库。</div>
            <div className="market-modal-actions">
              <button type="button" onClick={() => setModalOpen(false)}>取消</button>
              <button className="is-primary" type="submit">保存岗位</button>
            </div>
          </form>
        </MarketModal>
      )}

      {detailJob && (
        <MarketModal title={detailJob.role || detailJob.position} onClose={() => setDetailJob(null)}>
          <JobDetailContent job={detailJob} config={config} />
        </MarketModal>
      )}

      {resumeGate && (
        <ResumeMatchGateModal
          job={resumeGate.job}
          intent={resumeGate.intent}
          resumes={resumeChoices}
          selectedResumeId={selectedMatchResumeId}
          onSelectResume={setSelectedMatchResumeId}
          onUpload={uploadResumeForGate}
          uploading={resumeGateUploading}
          error={resumeGateError}
          inFlight={false}
          onConfirm={() => confirmResumeGate()}
          onCancel={() => setResumeGate(null)}
          onCreateResume={() => navigate("/dashboard")}
        />
      )}

      {jobMatchModalOpen && (
        <JobMatchModal
          open={jobMatchModalOpen}
          onClose={closeJobMatchModal}
          jobType={jobMatchType}
          initialDraft={jobMatchDraft}
          targetJobId={jobMatchTargetJobId}
          onDraftChange={setJobMatchDraft}
          resumeChoices={resumeChoices}
          selectedResumeId={selectedMatchResumeId}
          onSelectResumeId={setSelectedMatchResumeId}
          onComplete={handleJobMatchComplete}
          onRequireLogin={() => navigate("/profile")}
          rematchSessionId={jobMatchSession?.sessionId ?? ""}
        />
      )}

      {campusUploadOpen && (
        <MarketModal title="上传你的简历" onClose={() => setCampusUploadOpen(false)}>
          <div className="campus-upload-modal">
            <p>支持 PDF / DOC / DOCX</p>
            <label className={`campus-upload-drop ${campusUploadStatus}`}>
              <span>拖拽简历到这里</span>
              <strong>或者选择文件</strong>
              <input
                type="file"
                accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                disabled={campusUploadStatus === "uploading"}
                onChange={uploadCampusResume}
              />
            </label>
            {campusUploadStatus === "uploading" && (
              <div className="campus-upload-progress">
                <span>正在上传简历... {campusUploadProgress}%</span>
                <i style={{ width: `${campusUploadProgress}%` }} />
              </div>
            )}
            {campusUploadStatus === "success" && <p className="campus-upload-success">简历上传成功，现在可以进行岗位匹配</p>}
            {campusUploadStatus === "error" && <p className="campus-inline-error">{campusUploadError}</p>}
          </div>
        </MarketModal>
      )}

      {matchLoading && (
        <MatchLoadingOverlay
          job={matchLoading.job}
          resumeName={getResumeName(matchLoading.resumeId)}
          onCancel={cancelMatch}
        />
      )}

      {activeMatchReport && (
        <MatchScoreModal
          job={activeMatchReport.job}
          score={activeMatchReport.score}
          resumeName={activeMatchReport.resumeName || getResumeName(activeMatchReport.resumeId)}
          onClose={() => setActiveMatchReport(null)}
          onChangeResume={rerunMatchFromReport}
          onOptimize={() => navigateToResumeOptimization(activeMatchReport.job, activeMatchReport.resumeId)}
        />
      )}
    </section>
  );
}

function MarketModal({ title, onClose, children }) {
  return (
    <div className="market-modal-layer" role="presentation" onMouseDown={onClose}>
      <section className="market-modal" role="dialog" aria-modal="true" aria-label={title} onMouseDown={(event) => event.stopPropagation()}>
        <header>
          <h2>{title}</h2>
          <button type="button" aria-label="关闭弹窗" onClick={onClose}>×</button>
        </header>
        {children}
      </section>
    </div>
  );
}

function MatchLoadingOverlay({ job, resumeName, onCancel }) {
  return (
    <div className="match-loading-layer" role="status" aria-live="polite">
      <div className="match-loading-card">
        <div className="match-loading-ring" aria-hidden="true" />
        <h3>正在计算匹配度</h3>
        <p className="match-loading-job">{job.company} · {job.role}</p>
        <p className="match-loading-resume">使用简历：{resumeName}</p>
        <p className="match-loading-tip">AI 正在深度分析岗位要求与简历内容，预计需要几十秒，请稍候…</p>
        <button className="match-loading-cancel" type="button" onClick={onCancel}>取消匹配</button>
      </div>
    </div>
  );
}

function MatchScoreModal({ job, score, resumeName, onClose, onChangeResume, onOptimize }) {
  const tone = matchScoreTone(score);
  return (
    <MarketModal title="岗位匹配结果" onClose={onClose}>
      <div className="match-report">
        <section className={`match-report-hero is-${tone}`}>
          <div className="match-score-ring" aria-label={`综合匹配度 ${score}%`}>
            <strong>{score}</strong>
            <small>综合匹配</small>
          </div>
          <div>
            <span>岗位匹配</span>
            <h3>{job.company} · {job.role}</h3>
            <p>当前使用简历：{resumeName}</p>
            <strong>{getMatchScoreText(score)}</strong>
          </div>
        </section>

        <div className="match-recommendation">
          <strong>匹配度说明</strong>
          <p>匹配度由后端 AI 综合岗位要求与简历内容计算得出，仅供投递参考。</p>
        </div>

        <div className="market-modal-actions">
          <button type="button" onClick={onClose}>关闭</button>
          <button type="button" onClick={onChangeResume}>更换简历重新分析</button>
          <button className="is-primary" type="button" onClick={onOptimize}>简历优化</button>
        </div>
      </div>
    </MarketModal>
  );
}

function FilterSelect({ label, value, options, onChange }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    function handleDown(event) {
      if (rootRef.current && !rootRef.current.contains(event.target)) setOpen(false);
    }
    function handleKey(event) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handleDown);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleDown);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  const items = options.map(normalizeFilterOption);
  const text = value ?? "";
  const keyword = text.trim();
  const filteredItems = keyword
    ? items.filter((item) => item.label.includes(keyword))
    : items;

  function pick(itemValue) {
    onChange(itemValue);
    setOpen(false);
  }

  return (
    <div className="filter-select" ref={rootRef}>
      <span>{label}</span>
      <div
        className={`filter-select-trigger${open ? " is-open" : ""}`}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <input
          className="filter-select-input"
          type="text"
          value={text}
          placeholder="全部"
          onClick={(event) => event.stopPropagation()}
          onFocus={() => setOpen(true)}
          onChange={(event) => { onChange(event.target.value); }}
        />
        <span
          className="filter-select-caret"
          onClick={(event) => { event.stopPropagation(); setOpen((v) => !v); }}
          aria-hidden="true"
        >
          ▾
        </span>
      </div>
      {open && (
        <div className="filter-select-menu">
          <button type="button" className={value === "" ? "is-active" : ""} onClick={() => pick("")}>
            全部
          </button>
          {filteredItems.map((item) => (
            <button
              key={item.value}
              type="button"
              className={value === item.value ? "is-active" : ""}
              onClick={() => pick(item.value)}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const DETAIL_LONG_TEXT_KEYS = new Set([
  "duties", "requirements", "growth", "notice", "skills",
  "responsibilities", "jobDescription",
]);

function JobDetailContent({ job, config }) {
  const company = firstAvailable(job.company);
  const heroTags = [
    job.city,
    job.recruitmentTarget || job.targetAudience,
    job.recruitmentBatch || job.internshipType,
    job.workMode,
    job.businessType || job.companyType,
    job.conversion,
    isProvided(job.salary) ? `${job.salary}元/天` : "",
  ].filter((value) => isProvided(value));

  const longRows = config.detailRows.filter(([, key]) => DETAIL_LONG_TEXT_KEYS.has(key));
  const shortRows = config.detailRows.filter(([, key]) => !DETAIL_LONG_TEXT_KEYS.has(key));

  return (
    <div className="market-detail">
      <div className="market-detail-hero">
        {isProvided(company) && <span className="market-detail-company">{company}</span>}
        {heroTags.length > 0 && (
          <div className="market-detail-tags">
            {heroTags.map((tag) => <span className="market-pill" key={tag}>{tag}</span>)}
          </div>
        )}
      </div>

      {shortRows.length > 0 && (
        <div className="market-detail-grid">
          {shortRows.map(([label, key]) => (
            <div key={label}>
              <span>{label}</span>
              {renderDetailValue(job, key)}
            </div>
          ))}
        </div>
      )}

      {longRows
        .filter(([, key]) => isProvided(job[key]))
        .map(([label, key]) => (
          <section className="market-detail-block" key={label}>
            <h4>{label}</h4>
            <p>{String(job[key]).trim()}</p>
          </section>
        ))}
    </div>
  );
}

function renderDetailValue(job, key) {
  const value = job[key];
  if (isExternalUrl(value)) {
    return <a className="market-detail-link" href={value} target="_blank" rel="noopener noreferrer">打开链接 ↗</a>;
  }
  const text = key === "salary" && isProvided(value) ? `${value}元/天` : valueOrEmpty(value);
  return <strong>{text}</strong>;
}

function MarketActions({ job, config, matchState, onDetail, onMatch, onJobMatch, onOptimize }) {
  const url = firstAvailable(job.officialApplyUrl, job.applyUrl, job.applicationUrl, job.entryUrl);
  const hasApplyUrl = isExternalUrl(url);
  const isCampus = config.type === "campus";
  const applyLabel = isCampus ? "查看投递入口" : "申请实习";
  const trackLabel = isCampus ? "加入投递" : "加入实习跟踪";
  const favoriteLabel = job.favorite ? "已收藏" : "收藏";
  const matchLabel = matchState?.label ?? "匹配度";

  return (
    <div className="market-actions">
      <button className={`market-icon-button match-action-button is-${matchState?.tone ?? "idle"}`} type="button" onClick={onMatch} disabled={matchState?.tone === "loading"} title={matchLabel} aria-label={matchLabel}><img src={matchActionIcon} alt="" /></button>
      <button className="market-icon-button resume-optimize-button" type="button" onClick={onOptimize} title="简历优化" aria-label="简历优化"><img src={resumeOptimizeIcon} alt="" /></button>
      <button className="market-icon-button" type="button" title={favoriteLabel} aria-label={favoriteLabel}>{job.favorite ? <img src={favoriteOnIcon} alt="" /> : <img src={favoriteOffIcon} alt="" />}</button>
    </div>
  );
}

function ResumeMatchGateModal({
  job,
  intent,
  resumes,
  selectedResumeId,
  onSelectResume,
  onUpload,
  uploading,
  error,
  inFlight,
  onConfirm,
  onCancel,
  onCreateResume,
}) {
  const hasResumes = resumes.length > 0;
  const title = intent === "optimize" ? "选择用于简历优化的简历" : "选择用于岗位匹配的简历";
  return (
    <MarketModal title={title} onClose={onCancel}>
      <div className="resume-gate">
        <section className="resume-gate-job">
          <span>{intent === "optimize" ? "简历优化" : "岗位匹配"}</span>
          <h3>{job.company} · {job.role}</h3>
          <p>{intent === "optimize"
            ? "只传递 jobType、jobId 和 resumeId 到 AI 简历页，不把完整简历、完整JD或个人信息放入URL。"
            : "匹配分析由 Spring Boot 后端读取真实岗位和当前用户简历，前端不会保存或发送阿里云 API Key。"}</p>
        </section>

        {hasResumes ? (
          <div className="resume-choice-list" role="radiogroup" aria-label="已有简历">
            {resumes.map((resume) => (
              <label className={selectedResumeId === resume.id ? "is-selected" : ""} key={resume.id}>
                <input
                  type="radio"
                  name="resumeForMatch"
                  checked={selectedResumeId === resume.id}
                  onChange={() => onSelectResume(resume.id)}
                />
                <span>{resume.fileType || "RES"}</span>
                <div>
                  <strong>{resume.fileName}</strong>
                  <small>{formatFileSize(resume.fileSize)} · 当前浏览器会话简历</small>
                </div>
              </label>
            ))}
          </div>
        ) : (
          <div className="resume-gate-empty">
            <strong>完成岗位匹配前，请先上传或创建一份简历。</strong>
            <p>没有简历时不会生成匹配度，也不会使用虚假简历或随机分数。</p>
          </div>
        )}

        {error && <p className="resume-gate-error">{error}</p>}

        <div className="resume-gate-toolbar">
          <label>
            {uploading ? "上传中..." : "上传简历"}
            <input
              type="file"
              accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              disabled={uploading}
              onChange={onUpload}
            />
          </label>
          <button type="button" onClick={onCreateResume}>前往AI简历</button>
        </div>

        <div className="market-modal-actions">
          <button type="button" onClick={onCancel}>取消</button>
          <button className="is-primary" type="button" onClick={onConfirm} disabled={!selectedResumeId || uploading || inFlight}>
            {inFlight ? "分析中..." : intent === "optimize" ? "进入简历优化" : "开始匹配"}
          </button>
        </div>
      </div>
    </MarketModal>
  );
}

function MatchReportModal({ job, jobType, resumeName, result, onClose, onChangeResume, onOptimize }) {
  const sufficient = result?.informationSufficient !== false;
  const score = sufficient ? getOverallScore(result) : null;
  const tone = score == null ? "insufficient" : matchScoreTone(score);
  const dimensions = jobType === "campus"
    ? [
      ["关键词覆盖度", result?.keywordScore ?? result?.keyword_score],
      ["学历/专业匹配", result?.educationScore ?? result?.majorScore ?? result?.education_score],
      ["技能匹配", result?.skillScore ?? result?.skill_score],
      ["经历匹配", result?.experienceScore ?? result?.experience_score],
    ]
    : [
      ["关键词覆盖度", result?.keywordScore ?? result?.keyword_score],
      ["时间安排匹配", result?.scheduleScore ?? result?.attendanceScore],
      ["技能匹配", result?.skillScore ?? result?.skill_score],
      ["实践经历匹配", result?.experienceScore ?? result?.experience_score],
    ];

  return (
    <MarketModal title="岗位匹配报告" onClose={onClose}>
      <div className="match-report">
        <section className={`match-report-hero is-${tone}`}>
          <div className="match-score-ring" aria-label={score == null ? "信息不足" : `综合匹配度 ${score}%`}>
            {score == null ? <span>--</span> : <strong>{score}</strong>}
            <small>{score == null ? "信息不足" : "综合匹配"}</small>
          </div>
          <div>
            <span>{jobType === "campus" ? "校招岗位" : "实习岗位"}</span>
            <h3>{job.company} · {job.role}</h3>
            <p>当前使用简历：{resumeName}</p>
            <strong>{score == null ? "岗位或简历信息不足，暂不生成虚假分数。" : getMatchScoreText(score)}</strong>
          </div>
        </section>

        <div className="match-dimensions">
          {dimensions.map(([label, value]) => (
            <div key={label}>
              <span>{label}</span>
              <strong>{value == null ? "待补充" : `${value}%`}</strong>
            </div>
          ))}
        </div>

        <div className="match-report-grid">
          <MatchReportList title="主要优势" items={normalizeMatchReportArray(result?.strengths)} empty="后端尚未返回优势项" />
          <MatchReportList title="明显缺口" items={normalizeMatchReportArray(result?.gaps)} empty="后端尚未返回缺口项" />
          <MatchReportList title="缺失关键词" items={normalizeMatchReportArray(result?.missingKeywords ?? result?.missing_keywords)} empty="暂无缺失关键词" />
          <MatchReportList title="AI优化建议" items={normalizeMatchReportArray(result?.optimizationAdvice ?? result?.advice ?? result?.recommendation)} empty="暂无优化建议" />
        </div>

        <div className="match-recommendation">
          <strong>是否建议投递</strong>
          <p>{result?.recommendation || result?.shouldApply || "等待后端基于真实JD和简历返回建议。"}</p>
        </div>

        <div className="market-modal-actions">
          <button type="button" onClick={onClose}>关闭</button>
          <button type="button" onClick={onChangeResume}>更换简历重新分析</button>
          <button className="is-primary" type="button" onClick={onOptimize}>简历优化</button>
          <button type="button">加入投递</button>
        </div>
      </div>
    </MarketModal>
  );
}

function MatchReportList({ title, items, empty }) {
  return (
    <section>
      <h4>{title}</h4>
      {items.length > 0 ? (
        <ul>{items.map((item) => <li key={item}>{item}</li>)}</ul>
      ) : (
        <p>{empty}</p>
      )}
    </section>
  );
}

function getOverallScore(result) {
  const raw = result?.overallScore ?? result?.overall_score ?? result?.score;
  const score = Number(raw);
  if (!Number.isFinite(score)) return null;
  return Math.max(0, Math.min(100, Math.round(score)));
}

function parseMatchScore(text) {
  const raw = String(text ?? "").trim();
  if (!raw) return null;
  const match = raw.match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;
  const score = Number(match[0]);
  if (!Number.isFinite(score)) return null;
  return Math.max(0, Math.min(100, Math.round(score)));
}

function matchScoreTone(score) {
  if (score >= 85) return "high";
  if (score >= 70) return "good";
  if (score >= 50) return "medium";
  return "low";
}

function getMatchScoreText(score) {
  if (score >= 85) return "匹配度较高，可以优先推进。";
  if (score >= 70) return "具备投递价值，建议补强关键表达。";
  if (score >= 50) return "建议优化简历后再投递。";
  return "存在明显缺口，建议谨慎投递。";
}

function getRecommendScoreText(score) {
  const value = Number(score);
  if (!Number.isFinite(value) || value <= 0) return "查询岗位";
  return `推荐度 ${Math.round(value)}%`;
}

function normalizeRecommendReasons(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.map((item) => String(item ?? "").trim()).filter(Boolean).slice(0, 3);
  if (typeof value === "string") return value.split(/\n|;|；/).map((item) => item.trim()).filter(Boolean).slice(0, 3);
  return [];
}

function normalizeMatchReportArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.map((item) => (typeof item === "string" ? item : item?.text ?? item?.label ?? JSON.stringify(item))).filter(Boolean);
  }
  if (typeof value === "string") {
    return value.split(/\n|;|；/).map((item) => item.trim()).filter(Boolean);
  }
  if (typeof value === "object") {
    return Object.values(value).flatMap((item) => normalizeMatchReportArray(item));
  }
  return [String(value)];
}

function ExpandableList({ text, muted = false, maxItems = 1 }) {
  const [expanded, setExpanded] = useState(false);
  const items = String(text || "").split(/[\s、，,\/]+/).filter(Boolean);
  const isLong = items.length > maxItems;
  const ItemTag = muted ? "span" : "strong";

  if (!isLong) {
    return <ItemTag>{items.join("、")}</ItemTag>;
  }

  if (!expanded) {
    return (
      <ItemTag>
        {items.slice(0, maxItems).join("、")}
        <button type="button" className="market-more-toggle" onClick={() => setExpanded(true)}>查看更多</button>
      </ItemTag>
    );
  }

  return (
    <>
      <div className={muted ? "market-expand-list market-expand-list--muted" : "market-expand-list"}>
        {items.map((item) => <ItemTag key={item}>{item}</ItemTag>)}
      </div>
      <button type="button" className="market-more-toggle" onClick={() => setExpanded(false)}>收起</button>
    </>
  );
}

function JobTitleCell({ title, subtitle, badge }) {
  const badgeHref = isExternalUrl(badge) ? String(badge).trim() : "";
  return (
    <div className="market-title-cell">
      <strong>{title}</strong>
      <ExpandableList text={subtitle} muted />
      {badgeHref ? (
        <em>
          <a className="market-badge-link" href={badgeHref} target="_blank" rel="noopener noreferrer">官方公告</a>
        </em>
      ) : (
        <em>{badge}</em>
      )}
    </div>
  );
}

function CityCell({ city }) {
  return (
    <div className="market-two-line">
      <ExpandableList text={city} />
    </div>
  );
}

function TwoLine({ primary, secondary }) {
  return (
    <div className="market-two-line">
      <strong>{primary}</strong>
      <span>{secondary}</span>
    </div>
  );
}

function createEmptyMarketForm(config) {
  return Object.fromEntries(config.formFields.map(([key]) => [key, ""]));
}

function daysUntil(dateText) {
  const current = new Date("2026-07-15T00:00:00");
  const target = new Date(`${dateText}T00:00:00`);
  return Math.ceil((target - current) / 86400000);
}

function deadlineClass(dateText) {
  const days = daysUntil(dateText);
  if (Number.isNaN(days)) return "market-pill muted";
  if (days < 0) return "market-pill danger";
  if (days <= 7) return "market-pill orange";
  return "market-pill blue";
}

function formatDateLabel(dateText) {
  if (!dateText) return "未设置";
  const [, month, day] = dateText.split("-");
  return `${month}/${day}`;
}

const jobEntryConfigs = {
  campus: {
    jobType: "CAMPUS",
    tone: "campus",
    listPath: "/campus",
    draftKey: "guangqi-campus-job-entry-draft",
    localKey: "guangqi-campus-local-jobs",
    title: "录入一个新的校招投递目标",
    description: "保存校招岗位信息，跟踪招聘批次、截止时间、笔试和投递进度。",
    backLabel: "返回校招信息库",
    saveLabel: "保存校招岗位",
    jdPlaceholder: "将校招公告中的岗位职责、任职要求、招聘对象、专业要求和投递截止时间完整复制到这里。",
    noteHint: "记录内推人、网申账号、笔试时间、宣讲会、AI提醒和关注事项。",
    sections: [
      {
        title: "岗位基础信息",
        description: "校招岗位的企业、批次和投递入口信息。",
        fields: [
          { key: "company", label: "公司名称", required: true, placeholder: "例如：中国电信云能力中心" },
          { key: "role", label: "岗位名称", required: true, placeholder: "例如：云计算解决方案工程师" },
          { key: "city", label: "城市", required: true, placeholder: "例如：北京、上海、广州" },
          { key: "location", label: "工作地点", placeholder: "例如：北京海淀区" },
          { key: "industry", label: "行业", placeholder: "例如：通信云服务" },
          { key: "companyType", label: "企业性质", type: "select", required: true, options: ["央企", "国企", "民企", "外企", "事业单位", "研究所", "其他"] },
          { key: "graduation", label: "招聘届别", type: "select", required: true, options: ["2027届", "2026届", "不限届别"] },
          { key: "batch", label: "招聘批次", type: "select", required: true, options: ["提前批", "秋招", "春招", "补录", "日常招聘"] },
        ],
      },
      {
        title: "招聘要求",
        description: "学历、专业、笔试和截止时间用于后续匹配判断。",
        fields: [
          { key: "education", label: "学历要求", required: true, placeholder: "例如：本科及以上" },
          { key: "major", label: "专业要求", required: true, placeholder: "例如：计算机、通信工程、软件工程" },
          { key: "exam", label: "是否需要笔试", type: "select", required: true, options: ["需要笔试", "免笔试", "未说明"] },
          { key: "deadline", label: "截止日期", type: "date", required: true },
          { key: "entryUrl", label: "投递链接", type: "url", placeholder: "https://..." },
          { key: "noticeUrl", label: "招聘公告链接", type: "url", placeholder: "https://..." },
          { key: "tags", label: "标签", placeholder: "校招、央企、提前批，用逗号分隔", wide: true },
        ],
      },
    ],
    requiredFields: ["company", "role", "city", "companyType", "graduation", "batch", "education", "major", "exam", "deadline"],
    aiFields: [
      ["company", "公司名称"],
      ["role", "岗位名称"],
      ["city", "城市"],
      ["industry", "行业"],
      ["companyType", "企业性质"],
      ["graduation", "招聘届别"],
      ["batch", "招聘批次"],
      ["education", "学历要求"],
      ["major", "专业要求"],
      ["exam", "是否需要笔试"],
      ["deadline", "截止日期"],
      ["tags", "技能关键词"],
    ],
  },
  internship: {
    jobType: "INTERNSHIP",
    tone: "internship",
    listPath: "/internship",
    draftKey: "guangqi-internship-job-entry-draft",
    localKey: "guangqi-internship-local-jobs",
    title: "录入一个新的实习申请目标",
    description: "保存实习岗位信息，跟踪出勤要求、实习周期、日薪、到岗时间和转正机会。",
    backLabel: "返回实习机会库",
    saveLabel: "保存实习岗位",
    jdPlaceholder: "将实习岗位职责、任职要求、出勤时间、实习周期、薪资和转正说明完整复制到这里。",
    noteHint: "记录到岗时间、出勤安排、面试时间、实习证明、转正机会和AI提醒。",
    sections: [
      {
        title: "岗位基础信息",
        description: "实习岗位的公司、部门、办公方式和城市信息。",
        fields: [
          { key: "company", label: "公司名称", required: true, placeholder: "例如：字节跳动" },
          { key: "role", label: "实习岗位", required: true, placeholder: "例如：商业产品实习生" },
          { key: "department", label: "所属部门", placeholder: "例如：商业化产品部" },
          { key: "city", label: "城市", required: true, placeholder: "例如：北京" },
          { key: "location", label: "具体地点", placeholder: "例如：海淀区中关村" },
          { key: "industry", label: "行业", placeholder: "例如：互联网" },
          { key: "internshipType", label: "实习类型", type: "select", required: true, options: ["暑期实习", "日常实习", "寒假实习", "项目实习", "远程实习"] },
          { key: "workMode", label: "办公方式", type: "select", required: true, options: ["线下", "远程", "混合办公"] },
        ],
      },
      {
        title: "出勤和要求",
        description: "薪资、周期和转正机会是筛选实习岗位的关键。",
        fields: [
          { key: "salaryMin", label: "日薪最低值", type: "number", required: true, placeholder: "例如：180" },
          { key: "salaryMax", label: "日薪最高值", type: "number", required: true, placeholder: "例如：260" },
          { key: "attendance", label: "每周出勤天数", type: "select", required: true, options: ["1天", "2天", "3天", "4天", "5天"] },
          { key: "duration", label: "实习周期", type: "select", required: true, options: ["1个月以内", "1至3个月", "3至6个月", "6个月以上"] },
          { key: "startDate", label: "最早到岗日期", type: "date", required: true },
          { key: "conversion", label: "是否提供转正机会", type: "select", required: true, options: ["可转正", "不可转正", "未说明"] },
          { key: "education", label: "学历要求", placeholder: "例如：本科及以上" },
          { key: "skills", label: "技能要求", wide: true, placeholder: "例如：SQL、Python、用户研究" },
          { key: "deadline", label: "申请截止日期", type: "date" },
          { key: "applyUrl", label: "申请链接", type: "url", placeholder: "https://..." },
          { key: "tags", label: "标签", placeholder: "实习、远程、可转正，用逗号分隔", wide: true },
        ],
      },
    ],
    requiredFields: ["company", "role", "city", "internshipType", "workMode", "salaryMin", "salaryMax", "attendance", "duration", "startDate", "conversion"],
    aiFields: [
      ["company", "公司名称"],
      ["role", "实习岗位"],
      ["department", "所属部门"],
      ["city", "城市"],
      ["workMode", "办公方式"],
      ["internshipType", "实习类型"],
      ["salaryMin", "日薪最低值"],
      ["salaryMax", "日薪最高值"],
      ["attendance", "每周出勤"],
      ["duration", "实习周期"],
      ["startDate", "到岗时间"],
      ["conversion", "转正机会"],
      ["skills", "技能关键词"],
    ],
  },
};

const jobAiTabs = [
  { key: "parse", label: "JD解析" },
  { key: "match", label: "匹配分析" },
  { key: "advice", label: "简历建议" },
];

function JobEntryPage({ jobType, navigate, mode = "new" }) {
  const config = jobEntryConfigs[jobType];
  const [form, setForm] = useState(() => loadJobDraft(config) ?? createEmptyJobEntryForm(config));
  const [errors, setErrors] = useState({});
  const [toast, setToast] = useState("");
  const [dirty, setDirty] = useState(false);
  const [saveState, setSaveState] = useState("idle");
  const [activeAiTab, setActiveAiTab] = useState("parse");
  const [aiState, setAiState] = useState("idle");
  const [aiError, setAiError] = useState("");
  const [aiResults, setAiResults] = useState({ parse: null, match: null, advice: null });
  const [pendingSuggestions, setPendingSuggestions] = useState([]);
  const [selectedResumeId, setSelectedResumeId] = useState("");
  const abortRef = useRef(null);
  const formRef = useRef(null);
  const draftIdRef = useRef(`${config.jobType.toLowerCase()}-${Date.now()}`);
  const resumes = useMemo(() => getSessionResumeUploads(), []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (dirty) {
        saveJobDraft(config, form);
        setToast("草稿已保存");
      }
    }, 800);
    return () => window.clearTimeout(timer);
  }, [dirty, form, config]);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = window.setTimeout(() => setToast(""), 3000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    function handleBeforeUnload(event) {
      if (!dirty) return;
      event.preventDefault();
      event.returnValue = "";
    }
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      abortRef.current?.abort();
    };
  }, [dirty]);

  function updateField(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: "" }));
    setDirty(true);
  }

  async function pasteJd() {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        updateField("jd", text);
        setToast("已粘贴岗位JD");
      }
    } catch {
      setToast("浏览器未允许读取剪贴板，请手动粘贴。");
    }
  }

  async function readTextFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("text/") && !file.name.endsWith(".txt")) {
      setToast("文件解析接口待接入，目前仅支持TXT纯文本。");
      event.target.value = "";
      return;
    }
    const text = await file.text();
    updateField("jd", text);
    setToast("已导入文本JD");
    event.target.value = "";
  }

  async function runAiTask(task) {
    if (aiState === "loading") return;
    setAiError("");
    setActiveAiTab(task === "suggestions" ? "parse" : task);

    if ((task === "parse" || task === "suggestions") && !form.jd.trim()) {
      setAiState("insufficient");
      setAiError("请先粘贴岗位JD，再运行AI分析。");
      return;
    }

    if ((task === "match" || task === "advice") && !selectedResumeId) {
      setAiState("insufficient");
      setAiError("请先选择一份已上传或已创建的简历。");
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;
    setAiState("loading");

    const payload = {
      jobType: config.jobType,
      draftId: draftIdRef.current,
      jobDescription: form.jd,
      currentFields: buildJobPayload(config, form),
      resumeId: selectedResumeId || undefined,
      requestId: `${config.jobType}-${task}-${Date.now()}`,
    };

    try {
      const data = task === "parse"
        ? await parseJobDescription(payload, { signal: controller.signal })
        : task === "match"
          ? await analyzeJobMatch(payload, { signal: controller.signal })
          : task === "advice"
            ? await requestResumeAdvice(payload, { signal: controller.signal })
            : await requestFieldSuggestions(payload, { signal: controller.signal });

      if (task === "parse" || task === "suggestions") {
        const suggestions = normalizeAiSuggestions(config, data, form);
        setPendingSuggestions(suggestions);
        setAiResults((current) => ({ ...current, parse: { ...data, suggestions } }));
      } else {
        setAiResults((current) => ({ ...current, [task]: data }));
      }
      setAiState("success");
    } catch (error) {
      setAiState(error.message.includes("取消") ? "cancelled" : "failed");
      setAiError(error.message);
    } finally {
      abortRef.current = null;
    }
  }

  function stopAiTask() {
    abortRef.current?.abort();
    setAiState("cancelled");
    setAiError("已取消本次分析。");
  }

  function acceptSuggestion(field) {
    const suggestion = pendingSuggestions.find((item) => item.field === field);
    if (!suggestion) return;
    updateField(field, suggestion.value);
    setPendingSuggestions((current) => current.filter((item) => item.field !== field));
  }

  function ignoreSuggestion(field) {
    setPendingSuggestions((current) => current.filter((item) => item.field !== field));
  }

  function acceptAllSuggestions() {
    setForm((current) => {
      const next = { ...current };
      pendingSuggestions.forEach((item) => {
        next[item.field] = item.value;
      });
      return next;
    });
    setPendingSuggestions([]);
    setDirty(true);
    setToast("已接受AI解析建议");
  }

  function validate() {
    const nextErrors = {};
    config.requiredFields.forEach((field) => {
      if (!String(form[field] ?? "").trim()) {
        nextErrors[field] = "请填写必填项";
      }
    });

    ["entryUrl", "noticeUrl", "applyUrl"].forEach((field) => {
      const value = String(form[field] ?? "").trim();
      if (value && !/^https?:\/\//i.test(value)) {
        nextErrors[field] = "链接需要以 http:// 或 https:// 开头";
      }
    });

    if (config.jobType === "INTERNSHIP") {
      const min = Number(form.salaryMin);
      const max = Number(form.salaryMax);
      if (Number.isNaN(min) || min < 0) nextErrors.salaryMin = "请输入有效日薪";
      if (Number.isNaN(max) || max < 0) nextErrors.salaryMax = "请输入有效日薪";
      if (!Number.isNaN(min) && !Number.isNaN(max) && max < min) {
        nextErrors.salaryMax = "最高日薪不能低于最低日薪";
      }
    }

    setErrors(nextErrors);
    return nextErrors;
  }

  async function handleSubmit(event) {
    event.preventDefault();
    const nextErrors = validate();
    if (Object.keys(nextErrors).length > 0) {
      setToast("请先修正表单错误");
      formRef.current?.querySelector(".has-error input, .has-error select, .has-error textarea")?.focus({ preventScroll: true });
      return;
    }

    setSaveState("saving");
    const payload = buildJobPayload(config, form);
    try {
      await saveJobRecord(config.jobType, payload, mode === "edit" ? getEditIdFromPath() : undefined);
      clearJobDraft(config);
      setDirty(false);
      setSaveState("saved");
      setToast("岗位已写入后端数据库");
      window.setTimeout(() => navigate(config.listPath), 700);
    } catch {
      saveLocalJobEntry(config, payload);
      saveJobDraft(config, form);
      setSaveState("local");
      setToast("后端保存接口未连接，已保存为本地草稿。");
    }
  }

  function handleCancel() {
    if (dirty && !window.confirm("当前内容尚未正式保存，确定离开吗？")) return;
    navigate(config.listPath);
  }

  function deleteDraft() {
    clearJobDraft(config);
    setForm(createEmptyJobEntryForm(config));
    setDirty(false);
    setToast("草稿已删除");
  }

  return (
    <section className={`job-entry-page job-entry-${config.tone}`}>
      {toast && <div className="entry-toast" role="status">{toast}</div>}
      <div className="job-entry-head">
        <button type="button" className="entry-back-button" onClick={() => navigate(config.listPath)}>← {config.backLabel}</button>
        <div>
          <span className="entry-eyebrow">{config.jobType === "CAMPUS" ? "Campus target" : "Internship target"}</span>
          <h1>{config.title}</h1>
          <p>{config.description}</p>
        </div>
        <div className="entry-head-actions">
          <button type="button" onClick={() => { saveJobDraft(config, form); setToast("草稿已保存"); }}>保存草稿</button>
          <button type="button" onClick={handleCancel}>取消</button>
          <button type="button" className="is-primary" onClick={() => formRef.current?.requestSubmit()}>{config.saveLabel}</button>
        </div>
      </div>

      <div className="job-entry-grid">
        <form className="job-entry-form" ref={formRef} onSubmit={handleSubmit}>
          {config.sections.map((section) => (
            <FormSection
              key={section.title}
              section={section}
              form={form}
              errors={errors}
              onChange={updateField}
            />
          ))}

          <section className="entry-card jd-card">
            <div className="entry-section-title">
              <span>JD</span>
              <div>
                <h2>岗位描述JD</h2>
                <p>将招聘网站中的岗位职责、任职要求和加分项完整复制到这里，AI会优先根据完整JD进行解析。</p>
              </div>
            </div>
            <div className={`entry-field is-wide ${errors.jd ? "has-error" : ""}`}>
              <textarea
                value={form.jd}
                onChange={(event) => updateField("jd", event.target.value)}
                placeholder={config.jdPlaceholder}
                rows={12}
              />
              {errors.jd && <small>{errors.jd}</small>}
            </div>
            <div className="jd-toolbar">
              <button type="button" onClick={pasteJd}>粘贴岗位JD</button>
              <button type="button" onClick={() => updateField("jd", "")}>清空</button>
              <label>
                导入TXT
                <input type="file" accept=".txt,text/plain" onChange={readTextFile} />
              </label>
              <span>{form.jd.length} 字</span>
              <button type="button" className="is-primary" onClick={() => runAiTask("parse")}>AI解析JD</button>
            </div>
          </section>

          <section className="entry-card">
            <div className="entry-section-title">
              <span>Note</span>
              <div>
                <h2>备注和提醒</h2>
                <p>{config.noteHint}</p>
              </div>
            </div>
            <div className="entry-field is-wide">
              <textarea value={form.notes} onChange={(event) => updateField("notes", event.target.value)} rows={5} placeholder={config.noteHint} />
            </div>
            <div className={`entry-save-state is-${saveState}`}>
              {saveState === "saved" ? "已写入后端数据库" : saveState === "local" ? "当前保存为本地草稿，尚未写入数据库" : saveState === "saving" ? "正在保存" : "尚未保存"}
            </div>
          </section>

          <div className="entry-bottom-bar">
            <button type="button" onClick={deleteDraft}>删除草稿</button>
            <button type="button" onClick={handleCancel}>取消</button>
            <button type="submit" className="is-primary">{config.saveLabel}</button>
          </div>
        </form>

        <AiJobAssistantPanel
          config={config}
          form={form}
          resumes={resumes}
          selectedResumeId={selectedResumeId}
          setSelectedResumeId={setSelectedResumeId}
          activeTab={activeAiTab}
          setActiveTab={setActiveAiTab}
          aiState={aiState}
          aiError={aiError}
          aiResults={aiResults}
          pendingSuggestions={pendingSuggestions}
          onRun={runAiTask}
          onStop={stopAiTask}
          onAccept={acceptSuggestion}
          onIgnore={ignoreSuggestion}
          onAcceptAll={acceptAllSuggestions}
          onIgnoreAll={() => setPendingSuggestions([])}
          navigate={navigate}
          draftId={draftIdRef.current}
        />
      </div>
    </section>
  );
}

function FormSection({ section, form, errors, onChange }) {
  return (
    <section className="entry-card">
      <div className="entry-section-title">
        <span>{section.title.slice(0, 2)}</span>
        <div>
          <h2>{section.title}</h2>
          <p>{section.description}</p>
        </div>
      </div>
      <div className="entry-form-grid">
        {section.fields.map((field) => (
          <EntryField
            key={field.key}
            field={field}
            value={form[field.key] ?? ""}
            error={errors[field.key]}
            onChange={(value) => onChange(field.key, value)}
          />
        ))}
      </div>
    </section>
  );
}

function EntryField({ field, value, error, onChange }) {
  return (
    <label className={`entry-field ${field.wide ? "is-wide" : ""} ${error ? "has-error" : ""}`}>
      <span>{field.label}{field.required && <b>*</b>}</span>
      {field.type === "select" ? (
        <select value={value} onChange={(event) => onChange(event.target.value)}>
          <option value="">请选择</option>
          {field.options.map((option) => <option key={option} value={option}>{option}</option>)}
        </select>
      ) : (
        <input type={field.type ?? "text"} value={value} placeholder={field.placeholder ?? ""} onChange={(event) => onChange(event.target.value)} />
      )}
      {error && <small>{error}</small>}
    </label>
  );
}

function AiJobAssistantPanel({
  config,
  form,
  resumes,
  selectedResumeId,
  setSelectedResumeId,
  activeTab,
  setActiveTab,
  aiState,
  aiError,
  aiResults,
  pendingSuggestions,
  onRun,
  onStop,
  onAccept,
  onIgnore,
  onAcceptAll,
  onIgnoreAll,
  navigate,
  draftId,
}) {
  const activeResult = aiResults[activeTab];

  return (
    <aside className="job-ai-panel">
      <div className="job-ai-head">
        <span>AI</span>
        <div>
          <h2>AI 求职助攻</h2>
          <p>先保存岗位信息，再使用AI分析岗位要求、匹配程度和简历优化方向。</p>
        </div>
      </div>

      <div className="job-ai-actions">
        <button type="button" onClick={() => onRun("parse")}>AI解析JD</button>
        <button type="button" onClick={() => onRun("match")}>AI匹配分析</button>
        <button type="button" onClick={() => onRun("advice")}>AI简历优化建议</button>
        <button type="button" onClick={() => onRun("suggestions")}>AI信息补全</button>
      </div>

      <div className="resume-bind-box">
        <strong>选择绑定简历</strong>
        {resumes.length > 0 ? (
          <select value={selectedResumeId} onChange={(event) => setSelectedResumeId(event.target.value)}>
            <option value="">请选择简历</option>
            {resumes.map((resume) => <option key={resume.id} value={resume.id}>{resume.fileName}</option>)}
          </select>
        ) : (
          <p>当前没有可用简历。请先上传或创建简历后再运行匹配分析。</p>
        )}
        <button type="button" onClick={() => navigate("/dashboard")}>前往上传简历</button>
      </div>

      <div className="job-ai-tabs">
        {jobAiTabs.map((tab) => (
          <button key={tab.key} type="button" className={activeTab === tab.key ? "is-active" : ""} onClick={() => setActiveTab(tab.key)}>
            {tab.label}
          </button>
        ))}
      </div>

      <div className="job-ai-result">
        {aiState === "loading" && (
          <div className="ai-status-card">
            <strong>正在分析</strong>
            <p>请求已发送到后端AI接口，等待模型返回结构化结果。</p>
            <button type="button" onClick={onStop}>停止分析</button>
          </div>
        )}
        {aiState !== "loading" && aiError && (
          <div className={`ai-status-card is-${aiState}`}>
            <strong>{aiState === "insufficient" ? "信息不足" : aiState === "cancelled" ? "已取消" : "请求失败"}</strong>
            <p>{aiError}</p>
            {aiState === "failed" && <button type="button" onClick={() => onRun(activeTab)}>重新分析</button>}
          </div>
        )}
        {!aiError && !activeResult && aiState !== "loading" && (
          <div className="ai-status-card">
            <strong>未开始</strong>
            <p>AI功能只会在你主动点击按钮后运行，不会自动读取或提交表单内容。</p>
          </div>
        )}

        {activeTab === "parse" && pendingSuggestions.length > 0 && (
          <div className="ai-suggestion-list">
            <div className="ai-suggestion-toolbar">
              <strong>AI解析结果预览</strong>
              <button type="button" onClick={onAcceptAll}>全部接受</button>
              <button type="button" onClick={onIgnoreAll}>全部忽略</button>
            </div>
            {pendingSuggestions.map((item) => (
              <article key={item.field}>
                <span>{item.label}</span>
                <p>当前内容：{String(form[item.field] || "未填写")}</p>
                <strong>AI建议：{item.value}</strong>
                <small>{item.source || "AI结构化解析"} · {item.confidence || "待确认"}</small>
                <div>
                  <button type="button" onClick={() => onAccept(item.field)}>接受</button>
                  <button type="button" onClick={() => onIgnore(item.field)}>忽略</button>
                </div>
              </article>
            ))}
          </div>
        )}

        {activeTab === "match" && activeResult && <StructuredAiResult title="匹配分析报告" data={activeResult} />}
        {activeTab === "advice" && activeResult && (
          <>
            <StructuredAiResult title="简历优化建议" data={activeResult} />
            <button className="ai-resume-link" type="button" onClick={() => navigate(`/dashboard?jobDraft=${encodeURIComponent(draftId)}`)}>
              前往AI简历优化
            </button>
          </>
        )}
      </div>
    </aside>
  );
}

function StructuredAiResult({ title, data }) {
  const entries = Object.entries(flattenAiObject(data)).filter(([, value]) => value !== "" && value != null);
  return (
    <div className="structured-ai-result">
      <h3>{title}</h3>
      {entries.length === 0 ? (
        <p>后端已返回结果，但没有可展示字段。</p>
      ) : entries.slice(0, 16).map(([key, value]) => (
        <div key={key}>
          <span>{key}</span>
          <strong>{Array.isArray(value) ? value.join("、") : String(value)}</strong>
        </div>
      ))}
    </div>
  );
}

function createEmptyJobEntryForm(config) {
  const fields = config.sections.flatMap((section) => section.fields.map((field) => field.key));
  return Object.fromEntries([...fields, "jd", "notes"].map((key) => [key, ""]));
}

function loadJobDraft(config) {
  try {
    return JSON.parse(localStorage.getItem(config.draftKey) || "null");
  } catch {
    return null;
  }
}

function saveJobDraft(config, form) {
  localStorage.setItem(config.draftKey, JSON.stringify(form));
}

function clearJobDraft(config) {
  localStorage.removeItem(config.draftKey);
}

function saveLocalJobEntry(config, payload) {
  const current = JSON.parse(localStorage.getItem(config.localKey) || "[]");
  localStorage.setItem(config.localKey, JSON.stringify([{ ...payload, id: `${config.jobType.toLowerCase()}-local-${Date.now()}` }, ...current]));
}

function cleanText(value) {
  return String(value ?? "").replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "").trim();
}

function buildJobPayload(config, form) {
  const payload = {};
  Object.keys(form).forEach((key) => {
    payload[key] = cleanText(form[key]);
  });
  payload.jobType = config.jobType;
  payload.tags = cleanText(form.tags).split(/[,，、]/).map((item) => item.trim()).filter(Boolean);
  if (config.jobType === "INTERNSHIP") {
    payload.salaryMin = Number(form.salaryMin || 0);
    payload.salaryMax = Number(form.salaryMax || 0);
  }
  return payload;
}

function normalizeAiSuggestions(config, data, form) {
  const fields = data?.suggestions ?? data?.fields ?? data?.parsedFields ?? data;
  if (!fields || typeof fields !== "object") return [];
  return config.aiFields
    .map(([field, label]) => {
      const raw = Array.isArray(fields) ? fields.find((item) => item.field === field || item.key === field) : fields[field];
      const value = typeof raw === "object" && raw !== null ? raw.value ?? raw.suggestion : raw;
      if (value == null || String(value).trim() === "") return null;
      return {
        field,
        label,
        value: String(value).trim(),
        current: form[field],
        source: typeof raw === "object" ? raw.source : "AI解析",
        confidence: typeof raw === "object" ? raw.confidence : "待确认",
      };
    })
    .filter(Boolean);
}

function flattenAiObject(data, prefix = "") {
  if (!data || typeof data !== "object") return {};
  return Object.entries(data).reduce((result, [key, value]) => {
    const nextKey = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      return { ...result, ...flattenAiObject(value, nextKey) };
    }
    return { ...result, [nextKey]: value };
  }, {});
}

function getEditIdFromPath() {
  const parts = window.location.pathname.split("/").filter(Boolean);
  return parts.length >= 3 ? parts[1] : undefined;
}

const customServicePlans = [
  {
    id: "resume-polish",
    title: "简历重塑版",
    price: "￥598",
    subtitle: "适合已有目标、只差临门一脚的求职者",
    features: ["30 分钟 1V1 深度沟通", "简历结构重写", "核心卖点提炼", "岗位匹配校准"],
  },
  {
    id: "full-companion",
    title: "全程陪跑版",
    price: "￥998",
    subtitle: "适合需要系统支持和持续跟进的求职者",
    features: ["包含简历重塑全部服务", "投递节奏与岗位筛选", "面试准备与复盘", "阶段性策略微调"],
  },
];

const customServiceMentors = [
  {
    name: "徐老师",
    role: "战略导师",
    summary: "前互联网大厂 HRD",
    intro: "深耕大厂筛选逻辑，擅长跨行业转轨和高职级定级，帮助你看懂面试官真正关心的点。",
    tone: "cyan",
  },
  {
    name: "王导师",
    role: "业务实战",
    summary: "核心产品 / 运营专家",
    intro: "专注互联网业务面试辅导，提供降维拆解的项目梳理方法，专治“做过但说不出来”。",
    tone: "violet",
  },
  {
    name: "李顾问",
    role: "猎头视角",
    summary: "百强企业资深猎头",
    intro: "熟悉隐藏 HC 和薪资谈判节奏，擅长简历包装与面试策略，为你争取更优结果。",
    tone: "emerald",
  },
];

const customServiceSteps = [
  { id: "step-1", title: "提交基础情况", detail: "梳理学历、专业、经历和当前求职阶段。" },
  { id: "step-2", title: "明确求职目标", detail: "确认目标岗位、城市、行业和投递节奏。" },
  { id: "step-3", title: "生成专属方案", detail: "确定简历、岗位、投递和面试支持范围。" },
  { id: "step-4", title: "开始持续陪跑", detail: "按阶段推进，并根据反馈持续调整策略。" },
];

const customServiceBenefits = [
  {
    title: "更贴近真实岗位",
    description: "围绕目标岗位重构表达，减少模板感，提升简历和面试的命中率。",
  },
  {
    title: "更清晰的执行节奏",
    description: "把筛选、修改、投递、面试复盘放到同一条服务链路里，避免来回试错。",
  },
  {
    title: "更稳定的反馈迭代",
    description: "根据阶段反馈及时调整简历表达、投递方向和面试策略。",
  },
];

const customServiceTestimonials = [
  {
    name: "陈同学",
    title: "产品经理校招",
    quote: "1V1 之后我才知道，原来简历里最该被放大的不是经历数量，而是关键证据。",
  },
  {
    name: "刘先生",
    title: "互联网转岗",
    quote: "把项目讲清楚以后，面试回答顺了很多，连我自己都更能说服自己。",
  },
  {
    name: "张同学",
    title: "应届生求职",
    quote: "从简历到模拟面试再到投递跟进，整个节奏被梳理得很清楚。",
  },
];

const customServiceResources = [
  "求职白皮书",
  "高转化简历模板",
  "面试追问题库",
  "投递跟进清单",
];

const customServiceOptions = ["简历重塑", "岗位筛选", "模拟面试", "投递跟进", "薪资谈判"];

const customServiceInitialForm = {
  name: "",
  contact: "",
  identity: "",
  targetRole: "",
  expectedServices: [],
  note: "",
};

function CustomServicePageLegacy() {
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(customServiceInitialForm);
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!modalOpen) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function handleKeyDown(event) {
      if (event.key === "Escape") closeConsultation();
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [modalOpen, submitting]);

  function openConsultation() {
    setFormError("");
    setModalOpen(true);
  }

  function closeConsultation() {
    if (submitting) return;
    setModalOpen(false);
    setFormError("");
  }

  function updateFormField(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
    setFormError("");
  }

  function toggleExpectedService(option) {
    setForm((current) => {
      const hasOption = current.expectedServices.includes(option);
      return {
        ...current,
        expectedServices: hasOption
          ? current.expectedServices.filter((item) => item !== option)
          : [...current.expectedServices, option],
      };
    });
    setFormError("");
  }

  function validateConsultationForm() {
    if (!form.name.trim()) return "请填写姓名。";
    if (!form.contact.trim()) return "请填写联系方式。";
    if (!form.identity) return "请选择当前身份。";
    if (!form.targetRole.trim()) return "请填写目标岗位。";
    if (form.expectedServices.length === 0) return "请至少选择一项期望服务。";
    return "";
  }

  async function handleSubmitConsultation() {
    const validationError = validateConsultationForm();
    if (validationError) {
      setFormError(validationError);
      return;
    }

    setSubmitting(true);
    setFormError("");
    try {
      await submitCustomServiceInquiry(form);
    } catch (error) {
      setFormError(error.message || "咨询接口待接入。");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="custom-service-page" aria-label="定制化服务页面">
      <header className="custom-service-hero glass-panel">
        <div className="custom-service-hero-copy">
          <span className="custom-service-kicker">CUSTOMIZED CAREER SERVICE</span>
          <h1>把简历、岗位和面试，做成一条能打赢求职战的服务链路</h1>
          <p>
            参考附件页面的结构，我们把导师阵容、方案套餐、服务流程、学员见证和资料福利融合到律动求职的深蓝磨砂风格中。
            这里不是单点咨询，而是一套能持续推进的求职陪跑工作台。
          </p>
          <div className="custom-service-hero-actions">
            <button className="service-primary-button" type="button" onClick={openConsultation}>
              立即咨询
            </button>
            <button className="service-secondary-button" type="button" onClick={openConsultation}>
              提交需求
            </button>
          </div>
          <div className="custom-service-hero-stats">
            <article>
              <strong>2 套</strong>
              <span>核心服务方案</span>
            </article>
            <article>
              <strong>3 位</strong>
              <span>实战导师视角</span>
            </article>
            <article>
              <strong>4 步</strong>
              <span>服务推进流程</span>
            </article>
          </div>
        </div>
        <aside className="custom-service-hero-side">
          <img src={brandUrl} alt="律动求职" />
          <div>
            <span>专属求职顾问</span>
            <h2>律动求职定制服务</h2>
            <p>根据你的背景和目标岗位，组合出更适合投递的陪跑方案。</p>
          </div>
          <div className="custom-service-side-tags">
            <span>简历重塑</span>
            <span>岗位筛选</span>
            <span>面试陪跑</span>
            <span>薪资谈判</span>
          </div>
        </aside>
      </header>

      <section className="custom-service-mentor-section" aria-label="导师阵容">
        <div className="service-section-head">
          <span>实战导师阵容</span>
          <h2>把大厂筛选、业务表达和猎头视角放到同一页里</h2>
        </div>
        <div className="mentor-grid">
          {customServiceMentors.map((mentor) => (
            <article className={`mentor-card is-${mentor.tone}`} key={mentor.name}>
              <div className="mentor-card-head">
                <span>{mentor.role}</span>
                <strong>{mentor.summary}</strong>
              </div>
              <h3>{mentor.name}</h3>
              <p>{mentor.intro}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="custom-service-showcase" aria-label="定制服务套餐">
        <div className="service-plan-stack">
          {customServicePlans.map((plan) => (
            <article className="service-plan-card" key={plan.id}>
              <div className="service-plan-heading">
                <div>
                  <h3>{plan.title}</h3>
                  <p>{plan.subtitle}</p>
                </div>
                <strong>{plan.price}</strong>
              </div>
              <ul>
                {plan.features.map((feature) => (
                  <li key={feature}>{feature}</li>
                ))}
              </ul>
            </article>
          ))}
          <div className="service-action-row">
            <button className="service-primary-button" type="button" onClick={openConsultation}>
              立即咨询
            </button>
            <button className="service-secondary-button" type="button" onClick={openConsultation}>
              获取方案
            </button>
          </div>
        </div>

        <aside className="service-process-panel">
          <span>服务流程</span>
          <h2>从一次沟通开始</h2>
          <ol>
            {customServiceSteps.map((step, index) => (
              <li key={step.id}>
                <b>{String(index + 1).padStart(2, "0")}</b>
                <div>
                  <strong>{step.title}</strong>
                  <p>{step.detail}</p>
                </div>
              </li>
            ))}
          </ol>
        </aside>
      </section>

      <section className="custom-service-trust" aria-label="为什么选择定制化服务">
        <div className="service-section-head is-tight">
          <span>服务说明</span>
          <h2>为什么选择定制化服务？</h2>
        </div>
        <div className="service-benefit-grid">
          {customServiceBenefits.map((benefit) => (
            <article key={benefit.title}>
              <h3>{benefit.title}</h3>
              <p>{benefit.description}</p>
            </article>
          ))}
        </div>

        <div className="service-testimonial-grid">
          {customServiceTestimonials.map((item) => (
            <article key={item.name} className="testimonial-card">
              <p>“{item.quote}”</p>
              <div>
                <strong>{item.name}</strong>
                <span>{item.title}</span>
              </div>
            </article>
          ))}
        </div>

        <div className="service-resource-grid">
          <div>
            <span>资料福利</span>
            <h3>随方案附带的求职资料包</h3>
            <p>把高频需要的模板、题库和投递清单放在一起，减少你前期自己搜集资料的时间。</p>
          </div>
          <div className="resource-chip-list">
            {customServiceResources.map((resource) => (
              <span key={resource}>{resource}</span>
            ))}
          </div>
          <button className="service-primary-button" type="button" onClick={openConsultation}>
            领取资料包
          </button>
        </div>

        <p className="service-signature">—— 律动求职职业服务团队</p>
      </section>

      {modalOpen && (
        <div className="consult-modal-layer" role="presentation" onMouseDown={closeConsultation}>
          <section
            className="consult-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="consult-modal-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="consult-modal-head">
              <div>
                <span>Career service</span>
                <h2 id="consult-modal-title">咨询定制化服务</h2>
              </div>
              <button className="consult-close-button" type="button" aria-label="关闭咨询弹窗" onClick={closeConsultation} disabled={submitting}>
                ×
              </button>
            </div>

            <div className="consult-form-grid">
              <label>
                姓名
                <input value={form.name} onChange={(event) => updateFormField("name", event.target.value)} placeholder="请输入姓名" />
              </label>
              <label>
                联系方式
                <input value={form.contact} onChange={(event) => updateFormField("contact", event.target.value)} placeholder="手机号或邮箱" />
              </label>
              <label>
                当前身份
                <select value={form.identity} onChange={(event) => updateFormField("identity", event.target.value)}>
                  <option value="">请选择</option>
                  <option value="在校生">在校生</option>
                  <option value="应届生">应届生</option>
                  <option value="往届生">往届生</option>
                  <option value="职场人士">职场人士</option>
                </select>
              </label>
              <label>
                目标岗位
                <input value={form.targetRole} onChange={(event) => updateFormField("targetRole", event.target.value)} placeholder="例如 产品经理 / 前端开发" />
              </label>
              <fieldset className="consult-fieldset">
                <legend>期望服务</legend>
                <div>
                  {customServiceOptions.map((option) => (
                    <label key={option}>
                      <input
                        type="checkbox"
                        checked={form.expectedServices.includes(option)}
                        onChange={() => toggleExpectedService(option)}
                      />
                      <span>{option}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
              <label className="consult-wide-field">
                补充说明
                <textarea value={form.note} onChange={(event) => updateFormField("note", event.target.value)} placeholder="可以补充目标城市、当前进度或具体问题" />
              </label>
            </div>

            {formError && <p className="consult-form-error" role="alert">{formError}</p>}

            <div className="consult-modal-actions">
              <button className="service-secondary-button" type="button" onClick={closeConsultation} disabled={submitting}>
                取消
              </button>
              <button className="service-primary-button" type="button" onClick={handleSubmitConsultation} disabled={submitting}>
                {submitting ? "提交中" : "提交咨询"}
              </button>
            </div>
          </section>
        </div>
      )}
    </section>
  );
}

const csMentors = [
  {
    name: "王帅",
    role: "面试实战与薪酬谈判专家",
    cardRole: "面试实战专家",
    summary: "前京东/美团全国大区 HR 负责人",
    intro: "15年大厂 HR 实战经验，深谙大厂群面与结构化面试底层逻辑。擅长高压模拟演练与极限薪酬谈判，为你定制“业务导向”的高分话术，最大化争取 Offer 薪资天花板。",
    avatar: "王",
    photo: mentorWangPhoto,
    tone: "cyan",
    strengths: [
      "15年人力资源经验，近10年任职于京东、美团等头部大厂。",
      "履历横跨互联网、跨境电商、物流、区块链等多行业，能将业务战略转化为求职破局方案。",
      "在美团期间推动区域人效和业务达成均达全国双第一，曾3个月完成200人全国售后团队组建。",
    ],
    specialties: [
      ["破解大厂面试", "深谙大厂群面与结构化面试筛选逻辑，能从资深HR视角解析如何准备业务结果导向的面试。"],
      ["高压面试急救", "结果导向、实战性强，通过高强度模拟面试演练快速提升临场状态与表现力。"],
      ["极限薪资谈判", "拥有从0到1搭建薪酬、绩效、职级体系的完整经验，提供前沿谈薪策略和职业发展路径规划。"],
    ],
    audience: "适合冲刺大厂及物流、跨境电商、互联网中高层管理岗位的求职者，尤其适合急需打破面试瓶颈、快速提升面试表现力的候选人。",
    quote: "面试官要的不是完美的你，而是最合适的你——我的任务，就是帮你找到那个最合适的表达方式，把你面试的每一秒都用在刀刃上。",
  },
  {
    name: "杨丹",
    role: "资深职业规划与求职陪跑专家",
    cardRole: "求职陪跑与规划专家",
    summary: "前世界500强及外企HRD ｜ 二级人力资源管理师",
    intro: "21年资深实战面试官，深谙快消、游戏与电商大厂的人才筛选标准；15年+招聘操盘经验，为你提供从简历重塑、职业规划到全链路求职陪跑的深度护航。",
    avatar: "杨",
    photo: mentorYangPhoto,
    tone: "violet",
    strengths: [
      "21年人力资源实战经验，15年+ HRD 与资深 HRBP Leader 经历。",
      "拥有二级人力资源管理师与人力资源法务咨询师双重专业认证。",
      "服务过初创公司、优质上市公司及世界500强美资企业，经历企业从0-1到10-100不同阶段的人才与组织变革。",
    ],
    specialties: [
      ["全生命周期求职陪跑", "15年+ 校招与社招实战操盘经验，精准吃透企业真实用人画像，覆盖简历重塑、面试通关到斩获Offer。"],
      ["深度职业路径规划", "结合法务与HR双重视角，为求职者扫除竞业协议、劳动合同等职业盲区，定制长期发展路径。"],
      ["跨赛道破局转型", "深度了解快消、游戏、电商生态，擅长深挖底层通用能力，帮助候选人打破行业壁垒。"],
    ],
    audience: "适合冲刺互联网、游戏、快消等核心赛道的求职者；尤其适合职业迷茫期、校招突围和简历深度优化候选人。",
    quote: "真实的职场没有标准答案，但我能用21年的HR阅历，为你规划出那条避开所有暗礁的专属通关路线。",
  },
  {
    name: "李强",
    role: "面试突围与跨行转型专家",
    cardRole: "面试突围与跨行专家",
    summary: "15年资深业务型 HR | 前中手游、VIPKID 等名企HR操盘手",
    intro: "15年横跨游戏、电商等多赛道招聘实战，熟透大厂核心岗位画像。擅长行为（BEI）与压力面试拆解，带你透视面试官的“隐形评分表”，高效实现跨行跳槽与薪资突围。",
    avatar: "李",
    photo: mentorLiPhoto,
    tone: "emerald",
    strengths: [
      "15年人力资源全模块实战经验，稀缺的“懂业务的HR”。",
      "历经游戏、教育、跨境电商及制造等行业，曾主导搭建超500人规模核心业务团队。",
      "拥有中手游、VIPKID及天立教育等知名大厂与上市公司人才把关经验。",
    ],
    specialties: [
      ["高压面试通关", "深谙大厂行为面试（BEI）与压力面试底层逻辑，从面试官评分表视角倒推查漏补缺。"],
      ["跨赛道转型包装", "擅长挖掘底层可迁移能力，为面试经验少或急需跨行跳槽的求职者定制破局故事线。"],
      ["知己知彼的薪资谈判", "掌握企业定薪逻辑与谈判底牌，结合劳资风险管理经验帮你排雷避坑。"],
    ],
    audience: "适合冲刺泛互联网、游戏、教育科技、跨境电商等行业；尤其适合跨行业转型、跳槽瓶颈或实战面试经验较少的候选人。",
    quote: "面试官追问的每一个细节，都是验证你是否符合团队基因的线索。我不仅教你怎么答，更教你怎么踩中他们的隐藏得分点。",
  },
  {
    name: "邬娜",
    role: "高阶面辅与心理调适专家",
    cardRole: "高阶面辅与心理调适专家",
    summary: "管理学博士/国家三级心理咨询师 | 前腾讯/金山资深HR",
    intro: "18年名企HR管理与全盘咨询经验，腾讯外部特邀讲师。首创“心理学+HR双视角”辅导模型，专治面场高压焦虑；深谙大厂终面战略思维，擅长中高管及核心岗位高难度面试破局。",
    avatar: "邬",
    photo: mentorWuPhoto,
    tone: "cyan",
    strengths: [
      "管理学博士，国家三级心理咨询师，腾讯公司外部特邀讲师。",
      "18年HR从业经历，曾在腾讯、金山、三泰控股等头部大厂及上市公司担任要职。",
      "深度参与上市公司全资子公司筹建，具备极高职场视野和组织发展视角。",
    ],
    specialties: [
      ["降维打击的高管面辅", "多年与CEO/总经理等业务一号位直接对话，深谙高管面试中的战略思维与领导力考察。"],
      ["专治面场高压焦虑", "发挥心理学博士与咨询师优势，帮助学员缓解面试焦虑、重塑底层自信。"],
      ["全盘视角看岗配人", "拥有金融科技、IT互联网公司全盘HR咨询经验，能深度剖析企业真实组织需求。"],
    ],
    audience: "适合冲刺腾讯、金山等头部互联网大厂及金融科技行业核心岗位/中高层岗位；尤其适合终面压力大、表达受限或易焦虑的候选人。",
    quote: "HR的视角是面试的上帝视角。面试不只是机械地回答问题，我教你的是如何打出面试官看不到的那张底牌。",
  },
];

const csAllStarMentors = [
  ["李娜", "首席顾问", "管理学博士，腾讯外部特邀讲师。18年名企HR实战与全盘管理经验，擅长从企业用人的顶层逻辑出发提供职业路径规划。"],
  ["曾艳", "资深顾问", "18年高科技行业资深猎头，长期为Intel、阿里、腾讯等巨头输送核心人才，专攻研发、产品类岗位真实业务场景面试辅导。"],
  ["王艳媚", "资深顾问", "18年一线 RPO 与高端猎头经验，精准掌握华为、滴滴、网易等大厂招聘全流程，擅长高转化简历重塑。"],
  ["刘燕", "资深顾问", "16年金融、通讯及互联网行业人才发展实战经验，熟悉名企底层胜任力模型，专攻高潜人才与管培生项目通关。"],
  ["Nancy", "通讯/IC事业部总监", "兼具上市 IC 企业现职 HR 把关视野与资深猎头经验，精准把握芯片、电子通讯岗位画像。"],
  ["Louis", "市场部总监", "8年以上核心业务实战与名企合作经验，熟透市场营销、增长运营类岗位的真实业务考核逻辑。"],
];

const csResumePlans = [
  {
    id: "resume_598",
    title: "在校突围版",
    badge: "应届生 / 实习求职",
    subtitle: "专属校招 · 告别零经验",
    tone: "cyan",
    cta: "获取校招专属方案 →",
    features: [
      ["挖掘亮点，重塑校园经历", "履历单薄无亮点？导师深度剖析你的专业背景与课堂项目。将看似普通的流水账表述，转化为符合企业用人标准的 STAR 法则专业术语。"],
      ["高颜值排版 + ATS 完美过检", "剔除无效的学生气排版，交付对口名企的高质感商务简历，确保简历完美适配各大厂网申 ATS 筛选系统，让 HR 一眼锁定。"],
      ["校招网申通关指南", "解决专业不对口与缺乏实习的核心痛点。附赠高效投递辅助插件与大厂网申技巧指南，稳抓每一次宝贵的面试机会。"],
    ],
  },
  {
    id: "resume_998",
    title: "社招全能版",
    badge: "社招主推 · 高阶定制",
    subtitle: "重塑逻辑 · 冲刺高薪",
    tone: "purple",
    cta: "获取社招进阶方案 →",
    features: [
      ["痛点突破与高管级复盘", "遭遇求职瓶颈？重点解决跨行跳槽、空窗期、频繁跳槽等求职卡点。为您定制说服 HR 的高级叙事逻辑，并结合目标岗位定制人岗匹配策略。"],
      ["高转化简历 + 直聊破冰话术", "交付双格式极简商务简历。额外定制多套直聊破冰话术，全面覆盖 BOSS 直聘与猎头场景，直接抛出核心卖点，拉高招聘平台约面率。"],
      ["长周期护航：无限次微调", "拒绝“一锤子买卖”。支持针对不同公司、不同岗位要求，进行细节定向微调。全天候在线解答关于投递、面试及薪资谈判的突发疑问。"],
    ],
  },
];

const csInterviewFeatures = [
  "结构化面试技巧指导 (STAR法则深化)",
  "业务痛点剖析与 Case Study 演练",
  "面试复盘报告与录音/文字反馈",
  "薪资谈判 (谈薪) 策略专项辅导",
];

const csTestimonials = [
  {
    name: "陈同学",
    title: "产品经理岗",
    target: "字节跳动 · 校招产品",
    result: "成功斩获 Offer",
    service: "简历重塑 + 模拟面试",
    duration: "14天",
    quote: "1V1语音沟通非常透彻，帮我提炼了很多我自己都没发现的核心业务产出。改完的简历每一句话都踩在了HR的得分点上，上周已经拿到了字节的意向书。",
    tone: "cyan",
  },
  {
    name: "刘先生",
    title: "传统行业转行互联网",
    target: "头部互联网 · 运营策略",
    result: "回复率提升明显",
    service: "全能陪跑版",
    duration: "21天",
    quote: "之前自己海投一个月石沉大海。陪跑后导师帮我重新梳理跨行逻辑，定制了破冰话术去跟BOSS直聊，回复率直接翻倍，最后拿到了两家公司的终面。",
    tone: "violet",
  },
  {
    name: "张同学",
    title: "应届生秋招",
    target: "腾讯/美团 · 商业分析",
    result: "斩获双 Offer",
    service: "模拟面试",
    duration: "7天",
    quote: "模拟面试对我帮助特别大，导师把我从头到尾过了一遍，指出我叙事缺乏结构化的问题。真正面试遇到同类问题时，我回答得非常从容。",
    tone: "emerald",
  },
  {
    name: "周同学",
    title: "留学生回国求职",
    target: "快消外企 · 市场管培",
    result: "进入终面名单",
    service: "岗位筛选 + 简历精修",
    duration: "10天",
    quote: "原来我一直用英文简历的逻辑写中文简历，重点完全不对。导师帮我重新拆了经历顺序，项目成果也变得更像招聘方真正想看的内容。",
    tone: "cyan",
  },
  {
    name: "王女士",
    title: "社招跳槽",
    target: "新能源 · HRBP",
    result: "薪资谈判更有底气",
    service: "面试辅导 + 谈薪策略",
    duration: "12天",
    quote: "最有价值的是谈薪前的预案。老师帮我把底线、筹码和表达顺序都列清楚了，最后沟通时没有被节奏带跑，结果也比预期好。",
    tone: "violet",
  },
  {
    name: "赵同学",
    title: "0实习产品岗",
    target: "互联网 · 产品实习",
    result: "拿到实习 Offer",
    service: "项目包装 + 面试陪练",
    duration: "9天",
    quote: "我本来觉得没有大厂实习就没法写，后来老师带我把课程项目和社团经历拆成用户调研、需求分析、协作推进几块，简历一下清楚很多。",
    tone: "emerald",
  },
  {
    name: "林先生",
    title: "跨境电商运营",
    target: "出海品牌 · 运营负责人",
    result: "通过二面",
    service: "简历重塑版",
    duration: "6天",
    quote: "以前简历像流水账，改完后每段经历都有业务动作和结果承接。面试官追问的时候，我也能顺着简历里的逻辑讲出完整案例。",
    tone: "cyan",
  },
  {
    name: "何同学",
    title: "银行科技岗校招",
    target: "股份制银行 · 科技管培",
    result: "网申通过率提升",
    service: "网申材料优化",
    duration: "8天",
    quote: "老师帮我把技术项目翻译成银行能看懂的业务价值，也提醒我哪些表达容易显得太学生化。后面几轮网申明显顺了很多。",
    tone: "violet",
  },
];

const csCaseScreenshotNumbers = ["01", "02", "03", "04", "06", "08", "09", "11", "12", "13", "15", "16"];

const csCaseScreenshots = csCaseScreenshotNumbers.map((number) => {
  return {
    id: `case-${number}`,
    src: `/student-cases/case-${number}.jpg`,
    title: `学员聊天截图 ${number}`,
  };
});

const csModalCopy = {
  nav: ["添加专属顾问", "扫描下方二维码，发送您的当前简历与诉求，获取专属服务方案。"],
  hero_primary: ["添加专属顾问", "扫描下方二维码，发送您的当前简历与诉求，获取评估反馈及服务详情。"],
  resume_598: ["评估精调版简历", "发送当前简历，顾问将为您初步评估是否适合精调突围版。"],
  resume_998: ["定制全能版方案", "说明您的求职瓶颈，导师将为您规划重塑背景逻辑的方案。"],
  interview_mock: ["预约模拟面试", "发送您的目标岗位及JD，我们将为您匹配最合适的业务线导师。"],
  coaching_vip: ["申请陪跑评估", "私教陪跑需深度评估，请添加微信发送您的详细背景资料。"],
  welfare_pack: ["领取专属福利包", "添加微信，暗号“领资料”，系统将自动发送求职白皮书及模板。"],
};

const csModalImages = {
  hero_primary: customPlanQr,
  welfare_pack: freeResourceQrNew,
  resume_598: campusPlanQrNew,
  resume_998: socialPlanQrNew,
  career_plan: careerGuidanceQrNew,
  interview_plan: interviewGuidanceQrNew,
  salary_plan: salaryGuidanceQrNew,
  coaching_vip: coachingQrNew,
};

function CsMentorAvatar({ mentor }) {
  return (
    <div className="cs-mentor-avatar">
      {mentor.photo ? <img src={mentor.photo} alt={`${mentor.name}导师照片`} /> : mentor.avatar}
    </div>
  );
}

function formatTeacherName(name) {
  const normalizedName = name.trim();
  if (normalizedName.endsWith("老师")) return normalizedName;
  if (/[A-Za-z]/.test(normalizedName)) return `${normalizedName}老师`;
  return `${normalizedName.slice(0, 1)}老师`;
}

function CustomServicePage({ navigate }) {
  const [modalSource, setModalSource] = useState(null);
  const [selectedMentor, setSelectedMentor] = useState(null);
  const [selectedCaseImage, setSelectedCaseImage] = useState(null);
  const [testimonialDragging, setTestimonialDragging] = useState(false);
  const testimonialMarqueeRef = useRef(null);
  const testimonialDragRef = useRef({ pointerId: null, startX: 0, startScrollLeft: 0, dragging: false });
  const [modalTitle, modalDesc] = csModalCopy[modalSource] ?? csModalCopy.nav;
  const modalImage = csModalImages[modalSource] ?? customServiceQr;

  useEffect(() => {
    if (!modalSource && !selectedMentor && !selectedCaseImage) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEsc = (event) => {
      if (event.key === "Escape") setModalSource(null);
      if (event.key === "Escape") setSelectedMentor(null);
      if (event.key === "Escape") setSelectedCaseImage(null);
    };
    window.addEventListener("keydown", closeOnEsc);
    return () => {
      window.removeEventListener("keydown", closeOnEsc);
      document.body.style.overflow = previousOverflow;
    };
  }, [modalSource, selectedMentor, selectedCaseImage]);

  useEffect(() => {
    const marquee = testimonialMarqueeRef.current;
    if (!marquee) return undefined;
    const setInitialLoopPosition = () => {
      const loopWidth = marquee.scrollWidth / 2;
      if (loopWidth > 0 && marquee.scrollLeft === 0) {
        marquee.scrollLeft = loopWidth;
      }
    };
    setInitialLoopPosition();
    window.addEventListener("resize", setInitialLoopPosition);
    return () => window.removeEventListener("resize", setInitialLoopPosition);
  }, []);

  const openModal = (source) => setModalSource(source);

  useEffect(() => {
    function handleWelfareLinkClick(event) {
      const link = event.target?.closest?.('a.cs-secondary[href="#welfare"]');
      if (!link) return;
      event.preventDefault();
      setModalSource("welfare_pack");
    }

    document.addEventListener("click", handleWelfareLinkClick);
    return () => document.removeEventListener("click", handleWelfareLinkClick);
  }, []);

  function loopTestimonialScroll(marquee) {
    if (!marquee) return;
    const loopWidth = marquee.scrollWidth / 2;
    if (!loopWidth) return;
    if (marquee.scrollLeft >= loopWidth) {
      marquee.scrollLeft -= loopWidth;
      testimonialDragRef.current.startScrollLeft -= loopWidth;
    } else if (marquee.scrollLeft <= 0) {
      marquee.scrollLeft += loopWidth;
      testimonialDragRef.current.startScrollLeft += loopWidth;
    }
  }

  function handleTestimonialPointerDown(event) {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const marquee = testimonialMarqueeRef.current;
    if (!marquee) return;
    testimonialDragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startScrollLeft: marquee.scrollLeft,
      dragging: true,
    };
    setTestimonialDragging(true);
    loopTestimonialScroll(marquee);
    marquee.setPointerCapture?.(event.pointerId);
  }

  function handleTestimonialPointerMove(event) {
    const marquee = testimonialMarqueeRef.current;
    const drag = testimonialDragRef.current;
    if (!marquee || !drag.dragging || drag.pointerId !== event.pointerId) return;
    marquee.scrollLeft = drag.startScrollLeft - (event.clientX - drag.startX);
    loopTestimonialScroll(marquee);
  }

  function finishTestimonialDrag(event) {
    const marquee = testimonialMarqueeRef.current;
    const drag = testimonialDragRef.current;
    if (!drag.dragging || (event?.pointerId != null && drag.pointerId !== event.pointerId)) return;
    drag.dragging = false;
    drag.pointerId = null;
    setTestimonialDragging(false);
    marquee?.releasePointerCapture?.(event.pointerId);
  }

  return (
    <section className="custom-service-page cs-page" aria-label="定制化服务页面">
      <header className="cs-hero">
        <div className="cs-hero-glow" aria-hidden="true" />
        <div className="cs-hero-inner">
          <span className="cs-pill"><i />专注高价值互联网/国企求职赋能</span>
          <h1>
            律动求职 <br />
            <span>你的专属求职陪伴</span>
          </h1>
          <p>历经时间检验，为你筛选高质感、极具性价比的求职赋能产品。拒绝流水线，主打深度定制与真实提效。</p>
          <div className="cs-hero-actions">
            <button className="cs-primary" type="button" onClick={() => openModal("hero_primary")}>获取专属求职方案</button>
            <a className="cs-secondary" href="#welfare">领取免费资料包 ↓</a>
          </div>
        </div>
      </header>

      <section id="mentors" className="cs-section" aria-label="导师阵容">
        <div className="cs-section-head is-center">
          <h2>实战派 <span>导师阵容</span></h2>
          <p>均具备5年以上大厂/核心名企一线实战经验</p>
        </div>
        <div className="cs-mentor-grid">
          {csMentors.map((mentor) => (
            <button className={`cs-mentor-card is-${mentor.tone}`} key={mentor.name} type="button" onClick={() => setSelectedMentor(mentor)}>
              <CsMentorAvatar mentor={mentor} />
              <h3>{formatTeacherName(mentor.name)}</h3>
              <span>{mentor.cardRole}</span>
              <strong>{mentor.summary}</strong>
              <p>{mentor.intro}</p>
              <em>查看完整介绍</em>
            </button>
          ))}
        </div>
        <section className="cs-allstar-panel" aria-label="全明星实战导师团">
          <div className="cs-section-head is-tight">
            <h3>我们的全明星实战导师团</h3>
            <p>由大厂HR高管、资深行业猎头与组织发展专家组成，覆盖互联网、高科技、金融、通讯等核心行业。</p>
          </div>
          <div className="cs-allstar-grid">
            {csAllStarMentors.map(([name, title, intro]) => (
              <article key={name}>
                <strong>{formatTeacherName(name)}</strong>
                <span>{title}</span>
                <p>{intro}</p>
              </article>
            ))}
          </div>
        </section>
      </section>

      <section id="resume" className="cs-section cs-numbered" aria-label="简历重塑">
        <div className="cs-bg-number">01</div>
        <div className="cs-section-head is-center">
          <h2>最深度的 <span>简历重塑</span></h2>
          <p>挖掘隐藏高光，高质感简历精准拿面试</p>
        </div>
        <div className="cs-plan-grid">
          {csResumePlans.map((plan) => (
            <article className={`cs-plan-card is-${plan.tone}`} key={plan.id}>
              {plan.badge && <b className="cs-plan-badge">{plan.badge}</b>}
              <div className="cs-plan-heading">
                <div>
                  <h3>{plan.title}</h3>
                  <p>{plan.subtitle}</p>
                </div>
              </div>
              <div className="cs-plan-features">
                {plan.features.map(([title, detail]) => (
                  <div className="cs-feature-row" key={title}>
                    <i>✓</i>
                    <div>
                      <strong>{title}</strong>
                      <p>{detail}</p>
                    </div>
                  </div>
                ))}
              </div>
              <button className={plan.tone === "purple" ? "cs-primary is-purple" : "cs-secondary"} type="button" onClick={() => openModal(plan.id)}>{plan.cta}</button>
            </article>
          ))}
        </div>
        <article className="cs-commitment-card">
          <div className="cs-commitment-icon" aria-hidden="true"><span>◷</span></div>
          <div className="cs-commitment-copy">
            <h3>时效承诺：全局交付保障</h3>
            <p>
              沟通结束后，承诺于 <strong>48小时内</strong> 完成高质量初稿交付。若遇网申即将截止等紧急情况，
              可视情况开启 <strong>专属绿色极速通道（最快24H内出稿）</strong>，绝不耽误任何一次宝贵的投递机会。
            </p>
          </div>
        </article>
      </section>

      <section id="interview" className="cs-section cs-numbered cs-band" aria-label="面试突围">
        <div className="cs-bg-number">02</div>
        <div className="cs-section-head is-center">
          <h2>核心求职 <span>破局方案</span></h2>
          <p>资深大厂导师 1V1 诊断，量身定制您的高薪突围路径</p>
        </div>
        <div className="cs-plan-grid cs-solution-grid">
          <article className="cs-solution-card is-career">
            <h3>职业规划</h3>
            <p className="cs-solution-subtitle">突破职场瓶颈｜跨行转型策略</p>
            <p className="cs-solution-copy">
              迷茫期不知如何抉择？结合当下真实市场行情，深度剖析您的过往履历，精准提取“可迁移能力”。
              为您打破当前僵局，量身定制跨行转型或晋升的具体行动步调与时间轴。
            </p>
            <div className="cs-solution-strip">
              <span className="cs-solution-strip-label">专属产出预案</span>
              <strong>目标岗位可行性评估诊断</strong>
            </div>
            <button className="cs-primary" type="button" onClick={() => openModal("career_plan")}>获取定制规划方案 →</button>
          </article>
          <article className="cs-solution-card is-interview">
            <h3>面试辅导</h3>
            <p className="cs-solution-subtitle">高频考题预测｜压迫式实战演练</p>
            <p className="cs-solution-copy">
              面试总是卡在终面？大厂导师以真实面试官视角，为您进行沉浸式模拟摸底。提前暴露业务盲区，
              纠正流水账表达习惯，手把手帮您重塑符合大厂标准的 STAR 高分逻辑架构。
            </p>
            <div className="cs-solution-strip">
              <span className="cs-solution-strip-label">专属产出预案</span>
              <strong>目标岗位大厂核心真题库</strong>
            </div>
            <button className="cs-primary" type="button" onClick={() => openModal("interview_plan")}>获取模拟面试方案 →</button>
          </article>
          <article className="cs-solution-card is-salary">
            <h3>薪资博弈</h3>
            <p className="cs-solution-subtitle">底线与溢价测算｜幕后军师支援</p>
            <p className="cs-solution-copy">
              拿到 Offer 不会谈薪怕吃亏？为您深度拆解薪酬结构，结合行业真实水位测算合理涨薪空间。
              定制防套路 HR 沟通脚本，在不谈崩的前提下最大化争取 Total Package。
            </p>
            <div className="cs-solution-strip">
              <span className="cs-solution-strip-label">专属产出预案</span>
              <strong>独家谈薪攻防话术与底线测算</strong>
            </div>
            <button className="cs-primary" type="button" onClick={() => openModal("salary_plan")}>获取专属谈薪策略 →</button>
          </article>
        </div>
      </section>

      <section id="coaching" className="cs-section cs-vip" aria-label="全能陪跑">
        <span className="cs-gold-pill">尊享 VIP 服务</span>
        <h2>Offer 级 <span>求职私教陪跑</span></h2>
        <p>非标准化产品。我们将倾注全部资源，从职业规划、简历定制、岗位内推到面试辅导、薪资谈判，为你提供一条龙保姆式护航。</p>
        <article className="cs-vip-card">
          <b>每月仅限 5 个名额</b>
          <div>
            <h4>为什么我们每月限额？</h4>
            <p>因为真正的“陪跑”极其消耗导师心血。我们拒绝机械式海投，而是针对每一个目标公司深度定制策略。<span>接单前需进行深度双向评估。不是所有单子都接，接了绝对负责到底。</span></p>
            <div className="cs-vip-list">
              <span>? 无限次简历与作品集精调</span>
              <span>? 核心资源内部直推/强推</span>
              <span>? 每次面试前针对性 1V1 辅导</span>
              <span>? 陪伴至入职转正</span>
            </div>
          </div>
          <aside>
            <small>需评估后报价</small>
            <strong>定制方案</strong>
            <button className="cs-gold-button" type="button" onClick={() => openModal("coaching_vip")}>申请陪跑评估</button>
          </aside>
        </article>
      </section>

      <section id="testimonials" className="cs-section cs-band" aria-label="学员见证">
        <div className="cs-section-head is-center">
          <h2>真实案例与 <span>学员见证</span></h2>
          <p>不用虚假承诺，只用结果说话</p>
        </div>
        <div
          ref={testimonialMarqueeRef}
          className={`cs-testimonial-marquee ${testimonialDragging ? "is-dragging" : ""}`}
          aria-label="横向滑动学员案例，鼠标悬停暂停，可手动拖拽"
          onPointerDown={handleTestimonialPointerDown}
          onPointerMove={handleTestimonialPointerMove}
          onPointerUp={finishTestimonialDrag}
          onPointerCancel={finishTestimonialDrag}
          onPointerLeave={finishTestimonialDrag}
        >
          <div className="cs-testimonial-track">
            {[...csTestimonials, ...csTestimonials].map((item, index) => (
              <article key={`${item.name}_${index}`} className={`cs-testimonial-card is-${item.tone}`}>
                <b>"</b>
                <div className="cs-case-meta">
                  <span>{item.service}</span>
                  <em>{item.duration}</em>
                </div>
                <p>“{item.quote}”</p>
                <div className="cs-case-footer">
                  <span>{item.name}</span>
                  <small>
                    <strong>{item.title}</strong>
                    <i>{item.target}</i>
                    <span className="cs-case-result">{item.result}</span>
                  </small>
                </div>
              </article>
            ))}
          </div>
        </div>
        <div className="cs-case-proof-panel" aria-label="学员真实案例聊天截图">
          <div className="cs-case-proof-head">
            <div>
              <strong>学员真实沟通截图</strong>
              <p>展示服务过程与反馈记录，点击可查看大图。</p>
            </div>
            <span>12 份反馈</span>
          </div>
          <div className="cs-case-proof-grid">
            {csCaseScreenshots.map((image) => (
              <button
                type="button"
                className="cs-case-proof-card"
                key={image.id}
                onClick={() => setSelectedCaseImage(image)}
                aria-label={`查看${image.title}`}
              >
                <img src={image.src} alt={image.title} loading="lazy" />
              </button>
            ))}
          </div>
        </div>
      </section>

      <section id="welfare" className="cs-section cs-welfare" aria-label="资料福利">
        <div>
          <h2>限时福利：免费领取求职急救包</h2>
          <p>现在添加专属顾问，即可免费获取《2026大厂求职白皮书》+ 高转化的 3 套神仙简历模板。</p>
          <button className="cs-white-button" type="button" onClick={() => openModal("welfare_pack")}>添加微信，立即领取</button>
        </div>
      </section>

      <footer className="cs-footer">
        <div><span>律</span><p>律动求职 · 你的专属求职陪伴</p></div>
        <p>? 2026 律动求职团队版权所有. All rights reserved.</p>
      </footer>

      <SiteFooter navigate={navigate} />

      {modalSource && createPortal((
        <div className="cs-qr-modal-layer" role="dialog" aria-modal="true" aria-label={modalTitle} onMouseDown={() => setModalSource(null)}>
          <img
            className="cs-qr-modal-image"
            src={modalImage}
            alt="律动求职加油站二维码"
            onMouseDown={(event) => event.stopPropagation()}
          />
        </div>
      ), document.body)}
      {selectedCaseImage && createPortal((
        <div className="consult-modal-layer cs-case-image-layer" role="presentation" onMouseDown={() => setSelectedCaseImage(null)}>
          <section className="cs-case-image-modal" role="dialog" aria-modal="true" aria-labelledby="case-image-title" onMouseDown={(event) => event.stopPropagation()}>
            <button className="consult-close-button" type="button" aria-label="关闭截图预览" onClick={() => setSelectedCaseImage(null)}>×</button>
            <header>
              <span>真实案例截图</span>
              <h2 id="case-image-title">{selectedCaseImage.title}</h2>
            </header>
            <div className="cs-case-image-frame">
              <img src={selectedCaseImage.src} alt={selectedCaseImage.title} />
            </div>
          </section>
        </div>
      ), document.body)}
      {selectedMentor && createPortal((
        <div className="consult-modal-layer cs-contact-layer cs-mentor-layer" role="presentation" onMouseDown={() => setSelectedMentor(null)}>
          <section className="cs-mentor-detail-modal" role="dialog" aria-modal="true" aria-labelledby="mentor-detail-title" onMouseDown={(event) => event.stopPropagation()}>
            <button className="consult-close-button" type="button" aria-label="关闭导师详情" onClick={() => setSelectedMentor(null)}>×</button>
            <header>
              <CsMentorAvatar mentor={selectedMentor} />
              <div>
                <span>{selectedMentor.cardRole}</span>
                <h2 id="mentor-detail-title">{formatTeacherName(selectedMentor.name)} | {selectedMentor.role}</h2>
                <p>{selectedMentor.summary}</p>
              </div>
            </header>
            <div className="cs-mentor-detail-body">
              <section>
                <h3>核心优势</h3>
                <ul>{selectedMentor.strengths.map((item) => <li key={item}>{item}</li>)}</ul>
              </section>
              <section>
                <h3>核心绝活</h3>
                <div className="cs-mentor-specialties">
                  {selectedMentor.specialties.map(([title, detail]) => (
                    <article key={title}>
                      <strong>{title}</strong>
                      <p>{detail}</p>
                    </article>
                  ))}
                </div>
              </section>
              <section>
                <h3>适用人群</h3>
                <p>{selectedMentor.audience}</p>
              </section>
              <blockquote>“{selectedMentor.quote}”</blockquote>
            </div>
            <footer>
              <button className="cs-primary" type="button" onClick={() => { setSelectedMentor(null); openModal("hero_primary"); }}>咨询这位导师</button>
            </footer>
          </section>
        </div>
      ), document.body)}
    </section>
  );
}

function InterviewPage() {
  return (
    <section className="workspace-panel" aria-label="AI 面试页面">
      <PanelHeading title="AI 模拟面试" description="整理面试题、复盘回答结构，并跟踪准备进度。" />
      <div className="interview-layout">
        <section className="workspace-card interview-card">
          <span className="panel-tag">模拟配置</span>
          <h2>产品经理实习生</h2>
          <p>本轮训练将围绕项目复盘、需求分析、跨团队沟通和反问问题展开。</p>
          <button type="button" className="primary-cta compact"><span>开始模拟</span><i aria-hidden="true">→</i></button>
        </section>
        <section className="workspace-card">
          <span className="panel-tag">准备进度</span>
          <h2>已完成 68%</h2>
          <ProgressList items={[["自我介绍", 100], ["项目复盘", 75], ["行为面试", 58], ["反问题库", 40]]} />
        </section>
        <section className="workspace-card wide-card">
          <span className="panel-tag">题目清单</span>
          <h2>下一轮练习</h2>
          <ul className="workspace-list">
            <li>讲一个你推动跨团队合作的案例</li>
            <li>如何评估一次产品改版是否成功</li>
            <li>你如何处理需求变化和优先级冲突</li>
          </ul>
        </section>
      </div>
    </section>
  );
}

function ProfilePage() {
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("section") !== "applications") return;
    window.setTimeout(() => {
      document.getElementById("applications")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 80);
  }, []);

  return (
    <section className="workspace-panel" aria-label="个人中心页面">
      <PanelHeading title="个人中心" description="管理目标岗位、求职偏好、简历版本和面试记录。" />
      <div className="profile-grid">
        <section className="workspace-card">
          <span className="panel-tag">求职目标</span>
          <h2>产品 / 前端 / 数据分析</h2>
          <p>优先城市：上海、杭州、深圳。当前阶段：2026 届校招和暑期实习。</p>
        </section>
        <section className="workspace-card">
          <span className="panel-tag">资料完整度</span>
          <h2>78%</h2>
          <ProgressList items={[["基础信息", 100], ["教育经历", 90], ["项目经历", 72], ["作品链接", 48]]} />
        </section>
        <section className="workspace-card">
          <span className="panel-tag">提醒</span>
          <ul className="workspace-list">
            <li>明天 10:00 数据分析笔试</li>
            <li>周五前更新第二版简历</li>
            <li>本周完成 1 次模拟面试</li>
          </ul>
        </section>
      </div>
      <ApplicationTrackerManagement />
    </section>
  );
}

function NotFoundPage({ navigate }) {
  return (
    <section className="workspace-panel not-found" aria-label="页面未找到">
      <PanelHeading title="这个页面还没有配置" description="路径没有匹配到现有功能页。你可以回到工作台继续处理求职任务。" />
      <button className="primary-cta compact" type="button" onClick={() => navigate("/dashboard")}><span>回到工作台</span><i aria-hidden="true">→</i></button>
    </section>
  );
}

function PanelHeading({ title, description }) {
  return (
    <div className="workspace-panel-heading">
      <h2>{title}</h2>
      <p>{description}</p>
    </div>
  );
}

function ProgressList({ items, max = 100 }) {
  return (
    <div className="progress-list">
      {items.map(([label, value]) => (
        <div className="progress-item" key={label}>
          <div>
            <span>{label}</span>
            <b>{value}{max === 100 ? "%" : ""}</b>
          </div>
          <meter min="0" max={max} value={value} />
        </div>
      ))}
    </div>
  );
}

function JobRow({ role, company, match, status }) {
  return (
    <div className="job-row">
      <div>
        <strong>{role}</strong>
        <span>{company}</span>
      </div>
      <b>{match}</b>
      <em>{status}</em>
    </div>
  );
}

function jobToForm(job) {
  return {
    company: job.company ?? "",
    role: job.role ?? "",
    city: job.city ?? "",
    stage: job.stage ?? "pending",
    deadline: job.deadline ?? "",
    eventTime: normalizeDateTimeInput(job.eventTime ?? ""),
    jd: job.jd ?? "",
    link: job.link ?? "",
    resume: job.resume ?? "",
    aiScore: job.aiScore ?? "",
    tags: (job.tags ?? []).join("、"),
    notes: job.notes ?? "",
    favorite: Boolean(job.favorite),
  };
}

function formToJob(form, existingJob) {
  const stageMeta = STAGES.find((stage) => stage.key === form.stage) ?? STAGES[0];
  const aiScore = form.aiScore === "" ? null : Math.max(0, Math.min(100, Number(form.aiScore)));
  const deadlineLabel = form.deadline ? `截止 ${formatMonthDay(form.deadline)}` : "";
  const eventLabel = form.eventTime ? `${stageMeta.label} ${formatMonthDayTime(form.eventTime)}` : "";
  const fallbackLabel = stageMeta.key === "pending" ? "未设置截止" : `${stageMeta.label}时间待定`;

  return {
    id: existingJob?.id ?? `job-${Date.now()}`,
    stage: form.stage,
    company: form.company.trim(),
    role: form.role.trim(),
    city: form.city.trim(),
    timeType: form.deadline ? "截止" : stageMeta.label,
    timeLabel: deadlineLabel || eventLabel || fallbackLabel,
    deadline: form.deadline,
    eventTime: form.eventTime,
    aiScore,
    resume: form.resume.trim(),
    tags: splitTags(form.tags),
    favorite: Boolean(form.favorite),
    jd: form.jd.trim(),
    link: form.link.trim(),
    notes: form.notes.trim(),
    createdAt: existingJob?.createdAt ?? new Date().toISOString().slice(0, 10),
  };
}

function splitTags(value) {
  return value.split(/[、,，\s]+/).map((item) => item.trim()).filter(Boolean);
}

function normalizeDateTimeInput(value) {
  if (!value) return "";
  return value.length > 16 ? value.slice(0, 16) : value;
}

function formatMonthDay(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return `${String(date.getMonth() + 1).padStart(2, "0")}/${String(date.getDate()).padStart(2, "0")}`;
}

function formatMonthDayTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return `${formatMonthDay(value)} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function getScoreMeta(score) {
  if (score === null || score === undefined || score === "") return { label: "暂未匹配", tone: "empty" };
  const value = Number(score);
  if (value >= 85) return { label: `AI匹配 ${value}分`, tone: "excellent" };
  if (value >= 70) return { label: `AI匹配 ${value}分`, tone: "good" };
  return { label: `AI匹配 ${value}分`, tone: "low" };
}

function getTimeStatus(job) {
  if (!job.deadline && !job.eventTime) return "unset";
  const source = job.deadline || job.eventTime;
  const date = new Date(source);
  if (Number.isNaN(date.getTime())) return "unset";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);
  const diffDays = Math.round((target.getTime() - today.getTime()) / 86400000);
  if (diffDays < 0) return "overdue";
  if (diffDays <= 3) return "urgent";
  return "normal";
}

function getTimeMeta(job) {
  return { label: job.timeLabel || "未设置时间", status: getTimeStatus(job) };
}

function getTimeline(job) {
  const order = ["pending", "applied", "written", "first", "second"];
  const labels = ["创建岗位", "绑定简历", "完成投递", "收到笔试", "进入一面", "进入二面"];
  const index = order.indexOf(job.stage);
  const visible = labels.slice(0, Math.max(2, index + 2));
  if (!job.resume) return visible.filter((item) => item !== "绑定简历");
  return visible;
}

const rootElement = document.getElementById("root");
const appRoot = window.__gqldReactRoot ?? createRoot(rootElement);
window.__gqldReactRoot = appRoot;
appRoot.render(<App />);
