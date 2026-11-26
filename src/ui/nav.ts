import { useNavigate } from 'react-router-dom';

/** Samma API som skärmstacken i hugohulden/traningsapp, men med react-router. */
export type Screen = { name: 'recipes' } | { name: 'recipe'; id?: string };

export function useNav() {
  const navigate = useNavigate();
  return {
    push(s: Screen) {
      if (s.name === 'recipes') navigate('/mat/ratter');
      else navigate(s.id ? `/mat/ratt/${encodeURIComponent(s.id)}` : '/mat/ratt/ny');
    },
    pop() {
      navigate(-1);
    },
  };
}
