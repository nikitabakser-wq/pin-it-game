// Optional starter set offered on an empty dashboard. It is inserted as normal,
// fully editable rows — nothing here is special-cased anywhere else in the app.
export const templateAreas = [
  {
    name: "English",
    icon: "🇬🇧",
    color: "#3987e5",
    main_goal: "Reach B2",
    description: "Grammar, speaking, reading, writing, vocabulary, listening.",
    deadline: "2027-06-30",
    categories: ["Grammar", "Speaking", "Reading", "Writing", "Vocabulary", "Listening"],
  },
  {
    name: "Gym",
    icon: "🏋️",
    color: "#d95926",
    main_goal: "Build physique",
    description: "Training, strength and consistency.",
    deadline: null,
    categories: ["Strength", "Consistency", "Nutrition"],
  },
  {
    name: "Renovation",
    icon: "🏗️",
    color: "#199e70",
    main_goal: "Finish renovation",
    description: "Renovating the rented space.",
    deadline: null,
    categories: [] as string[],
  },
  {
    name: "Content",
    icon: "🎥",
    color: "#c98500",
    main_goal: "Build a consistent content system",
    description: "Filming, editing and publishing.",
    deadline: "2026-12-31",
    categories: ["Filming", "Editing", "Publishing"],
  },
  {
    name: "Other Projects",
    icon: "🚀",
    color: "#d55181",
    main_goal: "Launch projects",
    description: "AI agency, startups and experiments.",
    deadline: null,
    categories: [] as string[],
  },
];

export const templateRoadmap = {
  stage: { title: "Age 14", subtitle: "Foundation year", start_date: "2026-09-01", end_date: "2027-07-31", position: 0 },
  items: [
    { title: "Reach B2 English", area: "English" },
    { title: "Build physique", area: "Gym" },
    { title: "Finish renovation", area: "Renovation" },
    { title: "Build content system", area: "Content" },
    { title: "Launch projects", area: "Other Projects" },
  ],
};
