import React from "react";

export default function BackStepButton({ navigate, fallbackPath = "/dashboard", className = "" }) {
  function handleBack() {
    if (window.history.length > 1) {
      window.history.back();
      return;
    }
    navigate?.(fallbackPath);
  }

  return (
    <button
      className={`back-step-button ${className}`.trim()}
      type="button"
      onClick={handleBack}
      aria-label="返回上一步"
      title="返回上一步"
    >
      <span aria-hidden="true">‹</span>
      返回
    </button>
  );
}
