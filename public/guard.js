/* ตัวป้องกันเบื้องต้น: กันคลิกขวา/ลากรูป/ปุ่มลัดเปิดซอร์สโค้ดและ DevTools และเบลอหน้าเมื่อเปิด DevTools บนคอมพิวเตอร์
   หมายเหตุ: เป็นเพียง "ตัวชะลอ" ผู้ใช้ทั่วไป ไม่ใช่ความปลอดภัยจริง (โค้ดฝั่งเบราว์เซอร์ถูกส่งถึงเครื่องผู้ใช้เสมอ)
   ความลับจริง (รหัสผ่านแอดมิน ลิงก์ไฟล์จริง การตรวจสิทธิ์) อยู่ที่เซิร์ฟเวอร์เท่านั้น */
(() => {
  "use strict";
  // ช่องกรอก (รหัสผ่าน/URL/ข้อความ) ต้องใช้เมนูคลิกขวา/กดค้างเพื่อวางข้อความได้ จึงยกเว้นไว้
  const isField = (t) => !!(t && t.closest && t.closest("input, textarea, [contenteditable='true']"));
  const stop = (e) => { e.preventDefault(); e.stopPropagation(); };

  addEventListener("contextmenu", (e) => { if (!isField(e.target)) stop(e); }, true);
  addEventListener("dragstart", (e) => { if (!isField(e.target)) stop(e); }, true);
  addEventListener("selectstart", (e) => { if (!isField(e.target)) stop(e); }, true);

  // ปุ่มลัด: F12, Ctrl/Cmd+U (ดูซอร์ส), Ctrl/Cmd+S (บันทึกหน้า), Ctrl+Shift+I/J/C/K, Cmd+Option+I/J/C/U (Mac)
  addEventListener("keydown", (e) => {
    const c = e.ctrlKey || e.metaKey, k = e.code;
    const blocked =
      k === "F12" ||
      (c && !e.altKey && !e.shiftKey && (k === "KeyU" || k === "KeyS")) ||
      (c && e.shiftKey && (k === "KeyI" || k === "KeyJ" || k === "KeyC" || k === "KeyK")) ||
      (e.metaKey && e.altKey && (k === "KeyI" || k === "KeyJ" || k === "KeyC" || k === "KeyU"));
    if (blocked) stop(e);
  }, true);

  // ตรวจว่าเปิด DevTools แบบฝังข้างหน้าต่าง (เฉพาะคอมพิวเตอร์ที่มีเมาส์ ไม่ใช้กับมือถือ) ใช้เกณฑ์กว้างเพื่อไม่ให้เหมาผิด
  // เมื่อปิด DevTools แล้วหน้าจะกลับมาเป็นปกติเองทันที ไม่มีข้อมูลหาย
  if (matchMedia("(hover: hover) and (pointer: fine)").matches) {
    const root = document.documentElement;
    setInterval(() => {
      const open = outerWidth - innerWidth > 350 || outerHeight - innerHeight > 450;
      root.classList.toggle("dt-open", open);
    }, 800);
  }
})();
