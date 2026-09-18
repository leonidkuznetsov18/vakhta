function openImage(link: HTMLAnchorElement, content: HTMLElement, heading: HTMLElement) {
  const thumbnail = link.querySelector('img');
  if (!thumbnail) return false;
  const image = document.createElement('img');
  image.src = link.href;
  image.alt = thumbnail.alt;
  image.className = 'expanded-image';
  heading.textContent = thumbnail.alt;
  content.replaceChildren(image);
  return true;
}

function openStep(link: HTMLAnchorElement, content: HTMLElement, heading: HTMLElement) {
  const source = link.closest<HTMLElement>('[data-process]');
  if (!source) return false;
  const stage = source.cloneNode(true);
  if (!(stage instanceof HTMLElement)) return false;
  stage.querySelector('[data-expand-step]')?.remove();
  heading.textContent = link.dataset.stepTitle ?? '';
  content.replaceChildren(stage);
  return true;
}

export function enableMediaExpansion() {
  const dialog = document.querySelector<HTMLDialogElement>('[data-media-dialog]');
  const content = dialog?.querySelector<HTMLElement>('[data-media-content]');
  const heading = dialog?.querySelector<HTMLElement>('[data-media-heading]');
  const close = dialog?.querySelector<HTMLButtonElement>('[data-media-close]');
  const size = dialog?.querySelector<HTMLButtonElement>('[data-media-size]');
  if (!dialog || !content || !heading || !close || !size) return;
  document.documentElement.dataset.mediaEnabled = '';
  let trigger: HTMLAnchorElement | null = null;
  close.addEventListener('click', () => dialog.close());
  size.addEventListener('click', () => {
    const actualSize = content.classList.toggle('actual-size');
    size.setAttribute('aria-pressed', String(actualSize));
  });
  document.addEventListener('click', (event) => {
    if (!(event.target instanceof Element)) return;
    const link = event.target.closest<HTMLAnchorElement>('[data-expand-image], [data-expand-step]');
    if (!link || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    const isStep = link.hasAttribute('data-expand-step');
    const opened = isStep ? openStep(link, content, heading) : openImage(link, content, heading);
    if (!opened) return;
    event.preventDefault();
    trigger = link;
    size.hidden = isStep;
    size.setAttribute('aria-pressed', 'false');
    content.classList.remove('actual-size');
    dialog.showModal();
    content.scrollTop = 0;
    content.scrollLeft = 0;
  });
  dialog.addEventListener('close', () => {
    content.replaceChildren();
    trigger?.focus({ preventScroll: true });
    trigger = null;
  });
}
