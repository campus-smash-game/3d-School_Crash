CREATE TABLE building_destructions (
  id TEXT PRIMARY KEY NOT NULL,
  day TEXT NOT NULL,
  host TEXT NOT NULL,
  visitor TEXT NOT NULL,
  building TEXT NOT NULL,
  device TEXT NOT NULL
);
--> statement-breakpoint
CREATE INDEX building_destructions_day_visitor ON building_destructions(day,host,visitor);
