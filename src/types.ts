export type Area = "NECK_SHOULDER" | "ARM_WRIST" | "BACK" | "LEG_ANKLE";
export type Exercise = {
  id: string;
  name: string;
  category: string;
  measurementType: "REPS" | "DURATION";
  assessmentStatus: string;
  active: boolean;
  visible: boolean;
  version: number;
  discomfortAreas: Area[];
  description: string;
  preparation: string;
  instructions: string;
  precautions: string;
  introTtsText: string;
};
export type SetItem = {
  targetReps: number | null;
  targetDurationSeconds: number | null;
  weightKg: number;
  restSeconds: number;
};
export type Item = { exerciseId: string; name: string; sets: SetItem[] };
export type Template = {
  detail: {
    id: string;
    name: string;
    description: string;
    category: string;
    difficulty: string;
    exercises: Item[];
  };
  version: number;
  visible: boolean;
  hiddenReasons: string[];
};
export type Member = {
  id: string;
  nickname: string | null;
  role: string;
  status: string;
  onboarded: boolean;
  createdAt: string;
  lastLoginAt: string | null;
};
export type Summary = {
  total: number;
  active: number;
  onboarded: number;
  joinedToday: number;
};
export type History = {
  id: string;
  actorId: string;
  resourceType: string;
  resourceId: string;
  beforeState: string;
  afterState: string;
  createdAt: string;
};
export const areas: Record<Area, string> = {
  NECK_SHOULDER: "목 / 어깨",
  ARM_WRIST: "팔 / 손목",
  BACK: "등 / 허리",
  LEG_ANKLE: "다리 / 발목",
};
export const categories: Record<string, string> = {
  FULL_BODY: "전신",
  UPPER_BODY: "상체",
  LOWER_BODY: "하체",
  CORE: "코어",
  BACK: "등",
  CARDIO: "심폐",
};
export const levels: Record<string, string> = {
  BEGINNER: "초급",
  INTERMEDIATE: "중급",
  ADVANCED: "고급",
};
