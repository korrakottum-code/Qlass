import { Component } from "react";

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("App crashed:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            minHeight: "100vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "#f6f5f1",
            padding: 24,
            fontFamily: "sans-serif",
          }}
        >
          <div
            style={{
              maxWidth: 560,
              width: "100%",
              background: "#fff",
              border: "1px solid #ddd",
              borderRadius: 12,
              padding: 20,
              boxShadow: "0 8px 20px rgba(0,0,0,0.06)",
            }}
          >
            <h2 style={{ margin: 0, marginBottom: 10 }}>เกิดข้อผิดพลาดในการโหลดระบบ</h2>
            <p style={{ marginTop: 0, color: "#666" }}>
              กรุณารีเฟรชหน้าเว็บอีกครั้ง หากยังพบปัญหาให้ส่งข้อความด้านล่างให้ผู้ดูแลระบบ
            </p>
            <pre
              style={{
                margin: 0,
                background: "#fafafa",
                border: "1px solid #eee",
                borderRadius: 8,
                padding: 12,
                overflow: "auto",
                color: "#b42318",
                fontSize: 12,
              }}
            >
              {String(this.state.error?.message || this.state.error || "Unknown error")}
            </pre>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
