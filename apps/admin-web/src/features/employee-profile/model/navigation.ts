let listScroll = 0;
let returnEmployeeId: string | null = null;
export const employeeListReturnId = () => returnEmployeeId;
export function rememberEmployeeList(element: HTMLElement, employeeId: string) {
  returnEmployeeId = employeeId;
  listScroll = element.closest('main')?.scrollTop ?? window.scrollY;
}
export function restoreEmployeeList(element: HTMLDivElement | null) {
  if (!element) return;
  const frame = requestAnimationFrame(() => {
    const main = element.closest('main');
    if (main) main.scrollTop = listScroll;
    else if (window.scrollY !== listScroll) window.scrollTo(0, listScroll);
  });
  return () => cancelAnimationFrame(frame);
}
