// Ubicación que se enseña en la sección del mapa. Es de DEMOSTRACIÓN: calle genérica, sin número y con
// coordenadas aproximadas cerca de la Plaça de l'Ajuntament de València. No corresponde a ningún taller real.
// Para un taller real: cambiar estos datos y, si se quiere, `photo` por la ruta de una foto propia de la
// fachada (p. ej. '/fachada.webp' en public/). Mientras sea null se dibuja la fachada ilustrada.
export const LOCATION = {
  demo: true,
  shopName: 'TALLER DEMO',
  street: { es: 'Calle de demostración, s/n', en: 'Demo street, no number' },
  city: '46002 València',
  lat: 39.4697,
  lng: -0.3764,
  hours: { es: ['L–V 8:00–19:00', 'S 9:00–13:00'], en: ['Mon–Fri 8:00–19:00', 'Sat 9:00–13:00'] },
  photo: null,
};

export const directionsUrl = ({ lat, lng }) => `https://www.openstreetmap.org/directions?to=${lat}%2C${lng}#map=17/${lat}/${lng}`;
