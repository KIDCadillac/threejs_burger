const loading = document.querySelector("#sushi-loading");
const error = document.querySelector("#sushi-error");

try {
  await import("./sushi-app.mjs?v=20260831-sushi3");
  requestAnimationFrame(() => loading?.setAttribute("hidden", ""));
} catch (reason) {
  loading?.setAttribute("hidden", "");
  if (error) {
    error.hidden = false;
    error.textContent = reason?.message ?? "寿司台加载失败，请刷新页面重试。";
  }
  throw reason;
}
