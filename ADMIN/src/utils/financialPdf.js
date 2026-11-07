// Financial Summary > Download PDF: the page as it is on screen, on A4
// landscape pages -- the Total box across the page, the month boxes two to a
// row, then the headline figures, each chart slide across the page and the
// notes. Each box and chart is pictured on its own (html2canvas) and placed
// whole, so none is split across pages. jsPDF and html2canvas are loaded only
// when the button is pressed.

const PAGE_W = 297; // mm, A4 landscape
const PAGE_H = 210;
const MARGIN = 10;
const GAP = 5;
const FOOTER = 7;
const TEAL_DEEP = [26, 68, 66];
const MUTED = [87, 93, 89];

const today = () => {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${d.getFullYear()}`;
};

// root: the page's element. title: "01-04-2026 to 31-03-2027 - Financial Breakdown".
export async function downloadFinancialPdf(root, title) {
  const [{ jsPDF }, { default: html2canvas }] = await Promise.all([import("jspdf"), import("html2canvas")]);
  const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });

  const picture = async (el) => {
    const canvas = await html2canvas(el, { scale: 2, backgroundColor: "#ffffff", logging: false });
    // JPEG on white: a fraction of a PNG's size (PNG also carries an alpha mask per picture).
    return { data: canvas.toDataURL("image/jpeg", 0.9), ratio: canvas.height / canvas.width };
  };

  const fullWidth = PAGE_W - 2 * MARGIN;
  const halfWidth = (fullWidth - GAP) / 2;
  const bottom = PAGE_H - MARGIN - FOOTER;
  let y = MARGIN;

  const heading = (text, size, colour, gapAfter) => {
    if (y + size * 0.5 > bottom) {
      pdf.addPage();
      y = MARGIN;
    }
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(size);
    pdf.setTextColor(...colour);
    pdf.text(text, MARGIN, y + size * 0.35);
    y += size * 0.35 + gapAfter;
  };

  // Places one row of pictures (one full-width, or two side by side). A row
  // that nearly fits the space left on the page is shrunk a little to stay on
  // it; otherwise it starts a new page (shrunk if taller than a whole page).
  const placeRow = (pictures) => {
    const width = pictures.length === 1 ? fullWidth : halfWidth;
    const natural = Math.max(...pictures.map((p) => width * p.ratio));
    const left = bottom - y;
    let scale = Math.min(1, left / natural);
    if (scale < 0.7) {
      pdf.addPage();
      y = MARGIN;
      scale = Math.min(1, (bottom - MARGIN) / natural);
    }
    const height = natural * scale;
    pictures.forEach((p, i) => {
      const w = width * scale;
      pdf.addImage(p.data, "JPEG", MARGIN + i * (halfWidth + GAP), y, w, w * p.ratio, undefined, "FAST");
    });
    y += height + GAP;
  };

  const inPairs = async (elements) => {
    for (let i = 0; i < elements.length; i += 2) {
      placeRow(await Promise.all(elements.slice(i, i + 2).map(picture)));
    }
  };

  heading(title, 16, TEAL_DEEP, 3);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9);
  pdf.setTextColor(...MUTED);
  pdf.text(`Payroll from BC365 via HRMS Pay Sheet > Financial Summary. Downloaded ${today()}.`, MARGIN, y + 2);
  y += 7;

  const total = root.querySelector(".fs-box-total");
  if (total) placeRow([await picture(total)]);
  await inPairs([...root.querySelectorAll(".fs-box:not(.fs-box-total)")]);

  const charts = [...root.querySelectorAll(".fc-card")];
  if (charts.length) {
    heading("Payroll insights (amounts in Rs lakh)", 13, TEAL_DEEP, 3);
    const kpis = root.querySelector(".fc-kpis");
    if (kpis) placeRow([await picture(kpis)]);
    // Each chart is a full-width slide on screen: one per row here too.
    for (const chart of charts) placeRow([await picture(chart)]);
  }

  const notes = root.querySelector(".fs-notes");
  if (notes) placeRow([await picture(notes)]);

  const pages = pdf.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    pdf.setPage(p);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8);
    pdf.setTextColor(...MUTED);
    pdf.text(title, MARGIN, PAGE_H - MARGIN + 2);
    pdf.text(`Page ${p} of ${pages}`, PAGE_W - MARGIN, PAGE_H - MARGIN + 2, { align: "right" });
  }

  pdf.save(`${title.replace(/\s+/g, "_")}.pdf`);
}
