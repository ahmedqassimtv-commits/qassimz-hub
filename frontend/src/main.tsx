import React from "react";
import ReactDOM from "react-dom/client";
import { domAnimation, LazyMotion, MotionConfig } from "motion/react";
import "./styles/tokens.css";
import { App } from "./App";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <LazyMotion features={domAnimation} strict>
      <MotionConfig reducedMotion="user">
        <App />
      </MotionConfig>
    </LazyMotion>
  </React.StrictMode>
);
