import React from "react";
import qlassLogo from "../assets/qlass-logo.svg";

export default function LoadingScreen() {
  return (
    <div style={{
      position: "fixed", 
      inset: 0, 
      zIndex: 9999,
      background: "#1a1a2e",
      display: "flex", 
      flexDirection: "column", 
      alignItems: "center", 
      justifyContent: "center",
      fontFamily: "sans-serif", 
      color: "#fff", 
      textAlign: "center", 
      padding: 20,
      width: "100vw",
      height: "100vh"
    }}>
      <div style={{
        width: 80, 
        height: 80, 
        marginBottom: 16,
        background: "#fff",
        borderRadius: "50%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 40
      }}>Q</div>
      <h1 style={{ fontSize: 26, fontWeight: 800, marginBottom: 16 }}>Qlass</h1>
      <div style={{ 
        width: 40, 
        height: 40, 
        border: "4px solid rgba(255,255,255,0.3)", 
        borderTop: "4px solid #fff", 
        borderRadius: "50%", 
        animation: "spin 1s linear infinite",
        marginBottom: 16
      }} />
      <p style={{ fontSize: 14, color: "rgba(255,255,255,0.8)" }}>
        กำลังโหลดข้อมูล...
      </p>
      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
