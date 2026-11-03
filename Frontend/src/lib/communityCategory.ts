// Discover categories. Communities have no category column, so a community
// belongs to every category whose keywords appear in its name or description.
// "home" shows everything.

export type CategoryId = "home" | "education" | "science" | "gaming" | "music" | "entertainment";

const KEYWORDS: Record<Exclude<CategoryId, "home">, RegExp> = {
  education:
    /\b(department|course|class|study|studies|student|university|college|school|assignment|exam|fyp|project|research|lecture|semester|bscs|learn)/i,
  science:
    /\b(tech|code|coding|program|developer|dev|software|computer|cs\b|ai\b|data|science|engineering|web|app\b|apps\b|hack)/i,
  gaming: /\b(game|gaming|gamer|esports?|minecraft|valorant|fortnite|playstation|xbox)/i,
  music: /\b(music|song|band|guitar|piano|singer|beats?|playlist|concert)/i,
  entertainment: /\b(movie|film|anime|series|tv\b|meme|fun\b|entertainment|comedy)/i,
};

interface Categorizable {
  name: string;
  description?: string | null;
}

export function categoriesOf(community: Categorizable): CategoryId[] {
  const text = `${community.name} ${community.description ?? ""}`;
  return (Object.keys(KEYWORDS) as Exclude<CategoryId, "home">[]).filter((id) => KEYWORDS[id].test(text));
}

export function matchesCategory(community: Categorizable, id: CategoryId): boolean {
  return id === "home" || categoriesOf(community).includes(id);
}
