"use client";

import { useEffect, useState } from "react";
import PolyHeader from "../PolyHeader";

export default function MyAnalysisPage() {
  return (
    <div>
      <PolyHeader active="MyAnalysis" />
      <main>
        <h1>My Analysis</h1>
        <p>This is the My Analysis page.</p>
      </main>
    </div>
  );
}