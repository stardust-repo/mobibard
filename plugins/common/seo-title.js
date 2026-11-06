// 제품 이름 뒤에 검색용 접미사를 붙여 둡니다. 각 페이지의 언어 코드가 title을 다시 쓰더라도 접미사를 유지합니다.
// 사용: <script src="…/seo-title.js" data-suffix=" - MML 생성기"></script> (title 태그 바로 뒤)
(() => {
  const script = document.currentScript;
  const suffix = String(script?.dataset?.suffix || "");
  if (!suffix) return;
  const titleNode = document.querySelector("head > title");
  if (!titleNode) return;
  let busy = false;
  const apply = () => {
    if (busy) return;
    const text = String(titleNode.textContent || "").trim();
    if (!text || text.endsWith(suffix.trim())) return;
    busy = true;
    titleNode.textContent = text + suffix;
    busy = false;
  };
  apply();
  new MutationObserver(apply).observe(titleNode, { childList: true, characterData: true, subtree: true });
})();
