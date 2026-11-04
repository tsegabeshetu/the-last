

# Add Department Field, Seed Data, and Dashboard Pie Chart

## Summary

Add a `department` column to the `employees` table, create a fixed taxonomy of departments as a dropdown in the employee form, update the 10 existing employees with departments, and add a pie chart to the admin dashboard showing department distribution.

## Department Taxonomy

The following departments will be available in the dropdown:
Executive, Engineering, Product, Design, Marketing, Sales, Finance, Human Resources, Operations, Legal, Customer Success, Data & Analytics, IT & Infrastructure, Research & Development

## Changes

### 1. Database Migration — Add `department` column
Add a nullable `text` column `department` to the `employees` table with no default. This keeps it simple (no separate lookup table needed for a fixed list).

```sql
ALTER TABLE public.employees ADD COLUMN department text;
```

### 2. Update existing employees with departments
Use the insert tool to run UPDATE statements assigning each of the 10 employees a department based on their titles.

### 3. EmployeeForm — Add Department dropdown
**File:** `src/components/EmployeeForm.tsx`
- Add a `DEPARTMENTS` constant array with the taxonomy
- Add `department` to the Zod schema (optional string)
- Add a new `FormField` with a `Select` dropdown between the Title and Bio fields
- Pass `department` through in `handleSubmit`
- Update the `onSubmit` type to include `department`

### 4. Server functions — Add `department` to schema
**File:** `src/lib/employee-functions.ts`
- Add `department: z.string().max(100).optional().nullable()` to `employeeSchema`
- Include `department` in the insert/update objects

### 5. Update route mutation types
**Files:** `src/routes/_admin.admin.people.new.tsx`, `src/routes/_admin.admin.people_.$employeeId.edit.tsx`
- Add `department` to the mutation function value types

### 6. Employee profile — Show department
**File:** `src/routes/employee.$employeeId.tsx`
- Display department as a badge or text line below the title

### 7. Employee card — Show department
**File:** `src/components/EmployeeCard.tsx`
- Optionally show department text below the title on the non-compact card

### 8. Dashboard — Add pie chart
**File:** `src/routes/_admin.admin.dashboard.tsx`
- Import recharts `PieChart`, `Pie`, `Cell`, `Tooltip`, `Legend` (already available via the chart component setup)
- Compute department counts from the employees array
- Render a `Card` with a pie chart showing department distribution with color-coded segments
- Add this below the existing stats cards

### 9. Directory — Filter by department
**File:** `src/routes/directory.tsx`
- Include department in the search filter so users can search by department

## Technical Notes
- The `department` column is a plain `text` field. The taxonomy is enforced at the application level via the dropdown, not a DB constraint, making it easy to add/remove departments later.
- Recharts is already a dependency (used by the chart UI component). We'll use it directly for the pie chart.
- No RLS changes needed — existing policies cover the new column automatically.

