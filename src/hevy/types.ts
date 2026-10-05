export type HevySetType = "warmup" | "normal" | "failure" | "dropset" | "drop_set";

export type HevySet = {
  index?: number;
  type?: string;
  weight_kg?: number | null;
  reps?: number | null;
  rpe?: number | null;
};

export type HevyExercise = {
  index?: number;
  title?: string;
  exercise_template_id?: string;
  notes?: string | null;
  sets?: HevySet[];
};

export type HevyRoutine = {
  id: string;
  title: string;
  folder_id?: number | null;
  updated_at?: string;
  created_at?: string;
  exercises?: HevyExercise[];
};

export type HevyWorkout = {
  id: string;
  title: string;
  routine_id?: string | null;
  start_time?: string;
  end_time?: string;
  exercises?: HevyExercise[];
};

export type HevyExerciseTemplate = {
  id: string;
  title: string;
  type?: string;
  primary_muscle_group?: string;
  secondary_muscle_groups?: string[];
  is_custom?: boolean;
};

export type HevyUserInfo = {
  id?: string;
  name?: string;
  username?: string;
  url?: string;
};

export type Paginated<K extends string, T> = {
  page: number;
  page_count: number;
} & Record<K, T[]>;
