const SEASON = 2026;
const SERIES = 1;

async function fetchJson(url) {
    const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
    if (!res.ok) throw new Error(`${url} -> ${res.status}`);
    return res.json();
}

async function main() {
    const schedule = await fetchJson(
          `https://cf.nascar.com/cacher/${SEASON}/race_list_basic.json`
        );
    const races = schedule.series_1;
    const now = new Date();

  const completed = races
      .filter(
              (r) =>
                        r.series_id === SERIES &&
                        r.race_type_id === 1 &&
                        new Date(r.race_date) < now &&
                        r.winner_driver_id != null
            )
      .sort((a, b) => new Date(a.race_date) - new Date(b.race_date));

  const drivers = {};

  for (const race of completed) {
        let feed;
        try {
                feed = await fetchJson(
                          `https://cf.nascar.com/cacher/${SEASON}/${SERIES}/${race.race_id}/weekend-feed.json`
                        );
        } catch (e) {
                console.error(`skip ${race.race_id}: ${e.message}`);
                continue;
        }
        const results = feed.weekend_race?.[0]?.results ?? [];
        for (const r of results) {
                const id = String(r.driver_id);
                if (!drivers[id]) {
                          drivers[id] = {
                                      driver_id: r.driver_id,
                                      driver_name: r.driver_fullname,
                                      wins: 0,
                                      top5: 0,
                                      top10: 0,
                                      laps_led: 0,
                                      points_position: null,
                                      last_race: null,
                          };
                }
                const d = drivers[id];
                d.driver_name = r.driver_fullname;
                if (r.finishing_position === 1) d.wins++;
                if (r.finishing_position >= 1 && r.finishing_position <= 5) d.top5++;
                if (r.finishing_position >= 1 && r.finishing_position <= 10) d.top10++;
                d.laps_led += r.laps_led || 0;
                d.points_position = r.points_position;
                d.last_race = {
                          race_name: race.race_name,
                          track_name: race.track_name,
                          date: race.race_date,
                          finishing_position: r.finishing_position,
                          points_earned: r.points_earned,
                };
        }
  }

  // Live race check: is a race happening right now (roughly)?
  const live = races.find((r) => {
        const start = new Date(r.race_date);
        const diffHours = (now - start) / 36e5;
        return diffHours >= -1 && diffHours <= 6;
  });

  let liveData = null;
    if (live) {
          try {
                  const feed = await fetchJson(
                            `https://cf.nascar.com/live/feeds/series_${SERIES}/${live.race_id}/live_feed.json`
                          );
                  liveData = {
                            race_name: live.race_name,
                            flag_state: feed.flag_state,
                            lap: feed.lap_number,
                            laps_in_race: feed.laps_in_race,
                            vehicles: (feed.vehicles || []).map((v) => ({
                                        driver_id: v.driver?.driver_id,
                                        running_position: v.running_position,
                                        delta: v.delta,
                            })),
                  };
          } catch (e) {
                  console.error(`live feed unavailable: ${e.message}`);
          }
    }

  const fs = await import("node:fs/promises");
    await fs.mkdir("docs", { recursive: true });
    await fs.writeFile(
          "docs/nascar-driver-stats.json",
          JSON.stringify({ generated_at: now.toISOString(), drivers, live: liveData })
        );
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
