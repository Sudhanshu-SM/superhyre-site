export default {
  content: ['./src/**/*.{ts,tsx}', './index.html'],
  theme: {
    extend: {
      fontFamily: {
        heading: ['HelveticaNowDisplay-Medium', 'Helvetica Neue', 'Arial', 'sans-serif'],
        body: ['HelveticaNowDisplayW01-Rg', 'Helvetica Neue', 'Arial', 'sans-serif']
      },
      colors: {
        brand: {
          orange: '#FF4301'
        }
      }
    }
  },
  plugins: []
};