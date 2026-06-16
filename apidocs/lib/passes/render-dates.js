// Fill empty <time datetime="YYYY-MM-DD"> with a human-readable date so the
// author writes the machine date once and the rendered text can't drift from
// it. A <time> that already has its own text (e.g. "Not yet released") is left
// alone. Order-independent: no other pass reads or writes <time>.

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December"
];

export function renderDates($) {
  $("time[datetime]").each((_, el) => {
    const $el = $(el);
    if ($el.text().trim()) {
      return;
    }

    // Single ISO date token — a small regexp over a plain string, not HTML.
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec($el.attr("datetime"));
    if (!m) {
      return;
    }

    const [, year, month, day] = m;
    $el.text(`${MONTHS[Number(month) - 1]} ${Number(day)}, ${year}`);
  });
}
