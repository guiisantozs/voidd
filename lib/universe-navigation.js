// Select by section start, so a long parent section cannot override its children.
export function activeUniverseSection(sections, activationLine, atEnd = false) {
  if (!sections.length) return null;
  if (atEnd) return sections[sections.length - 1].id;
  let active = sections[0].id;
  for (const section of sections) if (section.top <= activationLine + 1 && (section.bottom == null || section.bottom > activationLine)) active = section.id;
  return active;
}
