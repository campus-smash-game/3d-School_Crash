CREATE TABLE analytics_events (id TEXT PRIMARY KEY NOT NULL, day TEXT NOT NULL, host TEXT NOT NULL, visitor TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('page','start')), device TEXT NOT NULL CHECK(device IN ('mobile','desktop')));
--> statement-breakpoint
CREATE INDEX analytics_day_visitor ON analytics_events(day,host,visitor);
