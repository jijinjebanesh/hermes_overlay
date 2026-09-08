// src/plugins/question/detector.ts
import { Detector } from "../../types";

export const detector: Detector = {
  detect(window) {
    const hasQuestion = /\?\s*$/.test(window);
    const hasList = /^\s*\d[\).\s]/m.test(window);
    return hasQuestion && hasList;
  },
};
