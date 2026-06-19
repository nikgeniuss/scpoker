// Общий фон-картинка для главной и лобби.
// position: fixed → фон не скроллится вместе с контентом и не «прыгает» при показе/скрытии
// адресной строки на мобиле. object-cover → кадрируется без растяжения (не меняет размер).
// Контент страницы должен лежать выше (relative z-10), фон — z-0.
export const PageBackground = ({ src = '/images/main-bg.jpg' }: { src?: string }) => (
  <img
    src={src}
    alt=""
    aria-hidden="true"
    draggable={false}
    className="fixed inset-0 w-full h-full object-cover z-0 pointer-events-none select-none"
  />
);
