import React, { useEffect, useState } from "react";
import { getCommunityCurrentUser } from "./communityApi.js";
import CommunityHome from "./community/CommunityHome.jsx";
import CommunityPostDetailPage from "./community/CommunityPostDetailPage.jsx";

export default function CommunityPage({ navigate, detailMode = false }) {
  const [toast, setToast] = useState("");
  const [user, setUser] = useState(() => getCommunityCurrentUser());

  useEffect(() => {
    document.body.classList.remove("ai-resume-active");
  }, []);

  function showToast(message) {
    setToast(message);
    window.clearTimeout(showToast.timer);
    showToast.timer = window.setTimeout(() => setToast(""), 2600);
  }

  return (
    <section className="community-page" aria-label="求职社区">
      {toast && <div className="community-toast" role="status">{toast}</div>}
      {detailMode ? (
        <CommunityPostDetailPage navigate={navigate} user={user} setUser={setUser} showToast={showToast} />
      ) : (
        <CommunityHome navigate={navigate} user={user} setUser={setUser} showToast={showToast} />
      )}
    </section>
  );
}
