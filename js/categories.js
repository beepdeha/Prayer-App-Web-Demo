/* ============================================================
   BUSINESS CATEGORIES — two levels.

   A business picks a primary type ("Food and Drink") and a secondary
   type within it ("Cafe / coffee shop"). The app shows the secondary
   on the tile and detail page, because that is what actually tells a
   congregant what the business does; the primary exists only to drive
   the directory filter, which would be unusable with 41 options.

   Duplicated verbatim in admin/categories.js — the admin deploys from
   admin/ as its hosting root and cannot read www/, the same reason
   admin/prayer-times.json is a copy. Keep the two in sync.
   ============================================================ */
export const CATEGORIES = {
  "Food and Drink": [
    "Cafe / coffee shop",
    "Takeaway or fast-casual restaurant",
    "Specialty bakery",
    "Restaurant",
    "Butcher shop",
    "Mobile catering",
    "Food van",
  ],
  "Retail": [
    "Independent clothing",
    "Bookshop",
    "Homeware / gift shop",
    "Specialist hobby shop",
    "Islamic Shop",
    "Grocery / convenience store",
  ],
  "Trades and Home Services": [
    "Electrician",
    "Plumber",
    "Painter/decorator",
    "Flooring or carpentry",
    "Gardening/landscaping",
    "Cleaning services",
    "Removals / man with a van",
  ],
  "Personal and Wellbeing Services": [
    "Hairdresser/barber",
    "Beauty salon or nail bar",
    "Personal training / fitness studio",
    "Massage or sports therapy",
  ],
  "Education and Tutoring": [
    "Private tutoring",
    "Exam prep or revision coaching",
    "Music or language lessons",
    "After-school clubs",
  ],
  "Professional and Data Services": [
    "Bookkeeping/accounts support",
    "Freelance admin",
    "Data analytics",
    "Graphic design / Printing",
    "Travel agent",
  ],
  "Creative and Digital": [
    "Photography / Videography",
    "Social media management",
    "Web design",
  ],
  "Automotive": [
    "Car detailing / Valeting",
    "Mobile Mechanic",
    "Car wash",
    "Mechanic / Garage",
  ],
  "Property Related": [
    "Property maintenance for landlords",
    "Short-term let (Airbnb) management",
    "House clearance",
  ],
};

export const PRIMARY_CATEGORIES = Object.keys(CATEGORIES);

/* What to show the reader. Falls back to the old single free-text
   `category` field so businesses added before the two-level split keep
   displaying something instead of going blank. */
export const displayCategory = b =>
  (b.categorySecondary || b.category || "").trim();
