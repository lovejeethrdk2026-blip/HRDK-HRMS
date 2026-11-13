// The Excel library (~140 KB gzipped) is only needed when someone clicks a
// download button, so it is fetched then instead of with the page.
//
// Usage in an export function:
//   import { XLSX, loadXlsx } from "./xlsx";
//   export async function exportSomething() {
//     await loadXlsx();
//     XLSX.utils.book_new(); // XLSX is a live binding, set once loaded
//   }
export let XLSX = null;

let loading = null;
export function loadXlsx() {
  loading ??= import("xlsx").then((lib) => {
    XLSX = lib;
    return lib;
  });
  return loading;
}
