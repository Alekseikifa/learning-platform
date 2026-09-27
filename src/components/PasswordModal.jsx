import { useState } from "react";
import Modal from "./Modal";

export default function PasswordModal({ name, onClose, onSubmit }) {
  const [pw, setPw] = useState("");
  return (
    <Modal onClose={onClose} innerStyle={{ maxWidth: 420 }}>
      <h3>Смена пароля</h3>
      <div className="muted small">Пользователь: <b>{name}</b></div>
      <input type="text" placeholder="Новый пароль" value={pw}
             onChange={e => setPw(e.target.value)} autoFocus style={{ width: "100%", marginTop: 10 }} />
      <div className="row" style={{ justifyContent: "flex-end", marginTop: 12 }}>
        <button className="btn ghost" onClick={onClose}>Отмена</button>
        <button className="btn primary" disabled={!pw} onClick={() => onSubmit(pw)}>Сохранить</button>
      </div>
    </Modal>
  );
}
