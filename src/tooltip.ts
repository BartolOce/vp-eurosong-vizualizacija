const el = document.getElementById('tooltip') as HTMLDivElement;

export function showTooltip(html: string, event: MouseEvent): void {
  el.innerHTML = html;
  el.classList.add('visible');
  moveTooltip(event);
}

export function moveTooltip(event: MouseEvent): void {
  const pad = 14;
  const w = el.offsetWidth;
  const h = el.offsetHeight;
  let x = event.clientX + pad;
  let y = event.clientY + pad;
  if (x + w > window.innerWidth - 8) x = event.clientX - w - pad;
  if (y + h > window.innerHeight - 8) y = event.clientY - h - pad;
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
}

export function hideTooltip(): void {
  el.classList.remove('visible');
}
