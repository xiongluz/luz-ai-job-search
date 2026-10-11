import React, { useMemo, useState } from "react";

function valueOrUnknown(value) {
  const text = String(value ?? "").trim();
  return text || "岗位暂未提供";
}

function toChipList(items) {
  return Array.from(new Set((Array.isArray(items) ? items : []).map((item) => String(item ?? "").trim()).filter(Boolean)));
}

function formatScore(score) {
  const value = Number(score);
  if (!Number.isFinite(value)) return "--";
  return `${Math.round(value)}%`;
}

function formatConfidence(score) {
  const value = Number(score);
  if (!Number.isFinite(value)) return "岗位暂未提供";
  return `${Math.round(value)}%`;
}

function buildPositionLabel(item) {
  const position = item?.job ?? item?.position ?? {};
  return {
    company: valueOrUnknown(position.companyName || position.company || item?.companyName),
    role: valueOrUnknown(position.positionName || position.role || item?.positionName),
    city: valueOrUnknown(position.locationText || position.city),
    employmentType: valueOrUnknown(position.employmentType),
    educationRequirement: valueOrUnknown(position.educationRequirement),
    majorRequirement: valueOrUnknown(position.majorRequirement),
    salaryText: valueOrUnknown(position.salaryText),
    deadline: valueOrUnknown(position.deadline),
    applyUrl: String(position.officialApplyUrl || position.applyUrl || position.entryUrl || "").trim(),
    sourceKey: String(position.sourceKey || item?.positionId || item?.id || "").trim(),
  };
}

function getReserveLabel(reserved) {
  return reserved ? "已保留" : "保留岗位";
}

export default function JobMatchResultsPanel({
  session,
  items,
  onNextBatch,
  nextBatchLoading,
  onRematch,
  onExit,
  onReserveToggle,
  reserveLoadingIds = {},
  onViewDetails,
  onOptimize,
  onApply,
  onAddToTracker,
}) {
  const [expandedIds, setExpandedIds] = useState([]);
  const list = useMemo(() => (Array.isArray(items) ? items : []), [items]);

  function toggleExplain(positionId) {
    setExpandedIds((current) => (
      current.includes(positionId)
        ? current.filter((item) => item !== positionId)
        : [...current, positionId]
    ));
  }

  const totalMatched = Number(session?.totalMatched ?? list.length);
  const currentBatch = Number(session?.batchNumber ?? 1);
  const currentBatchSize = Number(session?.batchSize ?? 15);
  const hasMore = Boolean(session?.hasMore);

  return (
    <section className="job-match-results" aria-label="AI为你推荐的岗位">
      <header className="job-match-results-head">
        <div>
          <span>AI 为你推荐的岗位</span>
          <h2>匹配结果</h2>
          <p>当前显示第 {currentBatch} 批，共 {list.length} 个岗位，累计匹配 {totalMatched} 个岗位。</p>
        </div>
        <div className="job-match-results-actions">
          <button type="button" onClick={onNextBatch} disabled={!hasMore || nextBatchLoading}>
            {nextBatchLoading ? "加载中..." : "换一批"}
          </button>
          <button type="button" onClick={onRematch}>调整条件重新匹配</button>
          <button type="button" className="is-primary" onClick={onExit}>退出匹配结果 / 返回全部岗位</button>
        </div>
      </header>

      <div className="job-match-results-meta">
        <div>每批最多 {currentBatchSize} 个</div>
        <div>本批 {list.length} 个</div>
        <div>{hasMore ? "还有下一批" : "符合条件的岗位已全部展示"}</div>
      </div>

      {list.length > 0 ? (
        <div className="job-match-grid-results">
          {list.map((item) => {
            const positionId = String(item.positionId ?? item.job?.positionId ?? item.position?.positionId ?? item.job?.id ?? item.id ?? item.job?.sourceKey ?? item.sourceKey ?? "");
            const reserved = Boolean(item.reserved);
            const open = expandedIds.includes(positionId);
            const position = buildPositionLabel(item);
            const detailReasons = toChipList(item.matchedReasons);
            const gaps = toChipList(item.gaps);
            const unknownItems = toChipList(item.unknownItems);
            const loadingReserve = Boolean(reserveLoadingIds[positionId]);

            return (
              <article className="job-match-card" key={positionId || `${position.company}-${position.role}`}>
                <div className="job-match-card-head">
                  <div>
                    <span className="job-match-card-company">{position.company}</span>
                    <h3>{position.role}</h3>
                    <p>{position.city} · {position.employmentType} · {position.educationRequirement}</p>
                  </div>
                  <div className="job-match-score">
                    <strong>{formatScore(item.matchScore)}</strong>
                    <span>匹配度</span>
                    <small>数据可信度 {formatConfidence(item.dataConfidence)}</small>
                  </div>
                </div>

                <div className="job-match-chip-row">
                  <span>{position.salaryText}</span>
                  <span>{position.majorRequirement}</span>
                  <span>{position.deadline}</span>
                </div>

                <div className="job-match-reasons">
                  {detailReasons.length > 0 ? detailReasons.slice(0, 3).map((reason) => <span key={reason}>{reason}</span>) : <span>匹配原因待补充</span>}
                </div>

                <details open={open} className="job-match-details">
                  <summary onClick={(event) => { event.preventDefault(); toggleExplain(positionId); }}>
                    {open ? "收起说明" : "匹配说明"}
                  </summary>
                  <div className="job-match-details-grid">
                    <div>
                      <strong>匹配原因</strong>
                      <p>{detailReasons.length > 0 ? detailReasons.join("，") : "岗位暂未提供"}</p>
                    </div>
                    <div>
                      <strong>差距提示</strong>
                      <p>{gaps.length > 0 ? gaps.join("，") : "岗位暂未提供"}</p>
                    </div>
                    <div>
                      <strong>未知项</strong>
                      <p>{unknownItems.length > 0 ? unknownItems.join("，") : "岗位暂未提供"}</p>
                    </div>
                  </div>
                </details>

                <div className="job-match-card-actions">
                  <button type="button" onClick={() => onApply?.(item)}>查看投递入口</button>
                  <button type="button" onClick={() => onAddToTracker?.(item)}>加入投递</button>
                  <button type="button" onClick={() => onViewDetails?.(item)}>查看详情</button>
                  <button type="button" onClick={() => toggleExplain(positionId)}>{open ? "收起说明" : "匹配说明"}</button>
                  <button type="button" onClick={() => onOptimize?.(item)}>简历优化</button>
                  <button
                    type="button"
                    className={reserved ? "is-primary" : ""}
                    onClick={() => onReserveToggle?.(item)}
                    disabled={loadingReserve}
                  >
                    {loadingReserve ? "处理中..." : getReserveLabel(reserved)}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="job-match-empty">
          <strong>匹配结果为空</strong>
          <p>后端暂时没有返回符合条件的岗位，请尝试放宽条件或重新匹配。</p>
        </div>
      )}
    </section>
  );
}
