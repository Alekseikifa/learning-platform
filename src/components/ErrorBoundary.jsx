import { Component } from "react";

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("Ошибка вкладки:", error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="card" style={{ color: "#dc2626" }}>
          <b>Не удалось открыть этот раздел.</b>
          <div className="muted small" style={{ marginTop: 6 }}>
            {String((this.state.error && this.state.error.message) || this.state.error)}
          </div>
          <button
            type="button"
            className="btn"
            style={{ marginTop: 10 }}
            onClick={() => this.setState({ error: null })}
          >
            Попробовать снова
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
