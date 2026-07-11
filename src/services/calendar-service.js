const fs = require('fs');
const path = require('path');
const os = require('os');
const ical = require('node-ical');

class CalendarService {
  constructor() {
    this.calendarBasePath = path.join(os.homedir(), '.local', 'share', 'evolution', 'calendar');
    this.sourcesPath = path.join(os.homedir(), '.config', 'evolution', 'sources');
    this.watchers = [];
    this.calendars = [];
    this._discoverCalendars();
  }

  /**
   * Discover all calendars from evolution sources config
   */
  _discoverCalendars() {
    this.calendars = [];
    const seenPaths = new Set();
    try {
      if (!fs.existsSync(this.sourcesPath)) return;

      const sourceFiles = fs.readdirSync(this.sourcesPath).filter(f => f.endsWith('.source'));

      for (const sourceFile of sourceFiles) {
        const content = fs.readFileSync(path.join(this.sourcesPath, sourceFile), 'utf-8');

        // Only process calendar sources
        if (!content.includes('[Calendar]')) continue;

        const nameMatch = content.match(/^DisplayName=(.+)$/m);
        const colorMatch = content.match(/^Color=(.+)$/m);
        const enabledMatch = content.match(/^Enabled=(.+)$/m);

        if (enabledMatch && enabledMatch[1].trim() === 'false') continue;

        const calId = sourceFile.replace('.source', '');
        const calName = nameMatch ? nameMatch[1].trim() : calId;
        const calColor = colorMatch ? colorMatch[1].trim() : '#62a0ea';

        // Map source ID to its actual data directory
        // "system-calendar" maps to the "system" folder in evolution data
        const dirMappings = [calId];
        if (calId === 'system-calendar') dirMappings.push('system');

        let icsPath = null;
        for (const dirName of dirMappings) {
          const candidate = path.join(this.calendarBasePath, dirName, 'calendar.ics');
          if (fs.existsSync(candidate)) {
            icsPath = candidate;
            break;
          }
        }

        // Skip if no ICS file found or already seen (prevents duplicates)
        if (!icsPath || seenPaths.has(icsPath)) continue;
        seenPaths.add(icsPath);

        this.calendars.push({
          id: calId,
          name: calName,
          color: calColor,
          icsPath: icsPath,
        });
      }

      // Fallback: If no calendars found via sources, scan directory directly
      if (this.calendars.length === 0) {
        this._scanCalendarDirs();
      }
    } catch (err) {
      console.error('Error discovering calendars:', err);
      this._scanCalendarDirs();
    }
  }

  /**
   * Fallback: scan calendar directory for .ics files
   */
  _scanCalendarDirs() {
    try {
      if (!fs.existsSync(this.calendarBasePath)) return;

      const dirs = fs.readdirSync(this.calendarBasePath, { withFileTypes: true })
        .filter(d => d.isDirectory());

      for (const dir of dirs) {
        const icsPath = path.join(this.calendarBasePath, dir.name, 'calendar.ics');
        if (fs.existsSync(icsPath)) {
          this.calendars.push({
            id: dir.name,
            name: dir.name === 'system' ? 'Personal' : dir.name,
            color: '#62a0ea',
            icsPath: icsPath,
          });
        }
      }
    } catch (err) {
      console.error('Error scanning calendar dirs:', err);
    }
  }

  /**
   * Get all calendars
   */
  getCalendars() {
    return this.calendars.map(c => ({
      id: c.id,
      name: c.name,
      color: c.color,
    }));
  }

  /**
   * Parse all events from all calendars
   */
  async getEvents() {
    const allEvents = [];

    for (const cal of this.calendars) {
      try {
        if (!fs.existsSync(cal.icsPath)) continue;

        const data = ical.sync.parseFile(cal.icsPath);

        for (const [key, event] of Object.entries(data)) {
          if (event.type !== 'VEVENT') continue;

          const start = event.start ? new Date(event.start) : null;
          const end = event.end ? new Date(event.end) : null;

          if (!start) continue;

          const durationMs = end ? (end.getTime() - start.getTime()) : 3600000; // default 1hr
          const durationMinutes = Math.round(durationMs / 60000);

          allEvents.push({
            id: event.uid || key,
            summary: event.summary || 'Untitled',
            description: event.description || '',
            start: start.toISOString(),
            end: end ? end.toISOString() : null,
            durationMinutes: durationMinutes,
            calendarId: cal.id,
            calendarName: cal.name,
            calendarColor: cal.color,
            location: event.location || '',
            created: event.created ? new Date(event.created).toISOString() : null,
          });
        }
      } catch (err) {
        console.error(`Error parsing calendar ${cal.name}:`, err);
      }
    }

    // Sort by start date descending (most recent first)
    allEvents.sort((a, b) => new Date(b.start) - new Date(a.start));

    return allEvents;
  }

  /**
   * Watch calendar files for changes
   */
  watchForChanges(callback) {
    // Clean up existing watchers
    this.stopWatching();

    for (const cal of this.calendars) {
      try {
        const dir = path.dirname(cal.icsPath);
        const watcher = fs.watch(dir, { persistent: false }, async (eventType) => {
          if (eventType === 'change') {
            // Debounce — wait 500ms for file to finish writing
            clearTimeout(this._debounceTimer);
            this._debounceTimer = setTimeout(async () => {
              try {
                const events = await this.getEvents();
                callback(events);
              } catch (err) {
                console.error('Error re-reading calendar:', err);
              }
            }, 500);
          }
        });
        this.watchers.push(watcher);
      } catch (err) {
        console.error(`Error watching calendar ${cal.name}:`, err);
      }
    }
  }

  stopWatching() {
    for (const watcher of this.watchers) {
      watcher.close();
    }
    this.watchers = [];
  }
}

module.exports = CalendarService;
