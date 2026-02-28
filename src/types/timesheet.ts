/**
 * A single task entry within a timesheet category block.
 */
export interface TimesheetEntry {
    /** Brief task description. */
    task: string;
    /** Start time in HH:MM format (24-hour). */
    start: string;
    /** End time in HH:MM format (24-hour). */
    end: string;
}

/**
 * A group of related tasks under a shared category label.
 */
export interface TimesheetCategory {
    /** Category label, e.g. "Coding: Auth Feature" or "Code Review". */
    category: string;
    /** Ordered list of task entries belonging to this category. */
    entries: TimesheetEntry[];
}

/**
 * The top-level timesheet document saved as YYYY-MM-DD.timesheet.json.
 */
export interface Timesheet {
    /** Date string in YYYY-MM-DD format. */
    date: string;
    /** List of categorized task blocks for the day. */
    tasks: TimesheetCategory[];
}
