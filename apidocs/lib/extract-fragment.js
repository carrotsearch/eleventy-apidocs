// Extract a labelled fragment from embedded content.
// Markers in the source file:
//   fragment-start{id} ... fragment-end{id}
// Lines containing other fragment markers are dropped from output, so
// fragments can nest without leaking markers into the rendered block.

const MARKER = /fragment-(start|end)\{[\w-]+\}/;

export function extractFragment(content, id) {
  if (!content) return "";

  const lines = content.split(/\r?\n/);
  const startRe = new RegExp(`fragment-start\\{${escape(id)}\\}`);
  const endRe = new RegExp(`fragment-end\\{${escape(id)}\\}`);

  const output = [];
  let inside = false;
  let found = false;

  for (const line of lines) {
    if (!inside) {
      if (startRe.test(line)) {
        inside = true;
        found = true;
        continue;
      }
      if (endRe.test(line))
        throw new Error(`Expected fragment-start{${id}}, saw fragment-end first.`);
      continue;
    }
    if (endRe.test(line)) {
      inside = false;
      continue;
    }
    if (MARKER.test(line)) continue;
    output.push(line);
  }

  if (inside) throw new Error(`fragment-end{${id}} not found.`);
  if (!found) throw new Error(`Fragment ${id} not found.`);
  return output.join("\n");
}

function escape(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
