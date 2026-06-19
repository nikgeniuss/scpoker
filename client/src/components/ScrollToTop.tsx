import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

// Сброс прокрутки наверх при смене маршрута. React Router сохраняет позицию
// окна между страницами — из-за этого новый экран открывался проскролленным вниз.
// Скроллим мгновенно (без smooth), чтобы переход был резким, как при обычной навигации.
export function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' as ScrollBehavior });
  }, [pathname]);
  return null;
}
