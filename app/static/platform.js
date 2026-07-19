export async function inviteFriend({ code, url }) {
  const text = `我调好了一根毒药薯条，敢来吃吗？\n房间 ${code}\n${url}`;
  try {
    await navigator.clipboard.writeText(text);
    return { copied: true, text };
  } catch (_error) {
    const field = document.createElement("textarea");
    field.value = text;
    field.setAttribute("readonly", "");
    field.style.position = "fixed";
    field.style.opacity = "0";
    document.body.append(field);
    field.select();
    const copied = document.execCommand("copy");
    field.remove();
    return { copied, text };
  }
}
