import { apiUrl } from "./apiConfig.js";

export async function generateQuestionBank(message, signal) {
  const response = await fetch(apiUrl("/ai/question-bank"), {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ message: message.trim() }),
    signal,
  });
  if (!response.ok) throw new Error("题库生成服务暂时不可用，请稍后重试。");
  const data = await response.json();
  if (!data || !Array.isArray(data.categories)) throw new Error("题库返回格式异常，请稍后重试。");
  return data;
}
