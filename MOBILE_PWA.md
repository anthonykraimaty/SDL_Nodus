# Mobile & PWA Implementation Guide

This document describes the mobile-friendly features and Progressive Web App (PWA) capabilities implemented in Nodus.

## Mobile Optimizations

### 1. Responsive Design

The application is fully responsive with breakpoints at:
- **Desktop**: > 768px
- **Tablet**: 481px - 768px
- **Mobile**: ≤ 480px
- **Landscape Mobile**: ≤ 896px (landscape orientation)

### 2. Touch-Friendly Interface

All interactive elements meet accessibility standards:
- **Minimum touch target**: 44x44px (WCAG AAA standard)
- **Touch feedback**: Visual feedback on tap/press
- **No hover dependence**: Touch devices get active states instead
- **Tap highlight**: Removed webkit tap highlights for cleaner UX

### 3. Mobile-Specific Features

#### Typography
- Font sizes automatically adjust on smaller screens
- Minimum font size of 16px on inputs (prevents iOS zoom)
- Optimized line heights for readability

#### Navigation
- **Hamburger menu** on screens < 640px
- **Collapsible nav** with smooth animations
- **Large touch targets** for all nav items
- **Auto-close** on navigation

#### Viewport Settings
```html
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=5.0, user-scalable=yes" />
```

#### Theme Colors
- Theme color: `#795548` (primary brown)
- Status bar style: Default (adapts to device)
- Background: Light khaki gradient

### 4. Performance Optimizations

- **Lazy loading**: Images and components load on demand
- **Touch action optimization**: `touch-action: manipulation` prevents double-tap zoom
- **Hardware acceleration**: CSS transforms use GPU
- **Reduced animations**: Simpler animations on mobile

## Progressive Web App (PWA)

### 1. Installation

The app can be installed on any device:

#### Android
1. Open the app in Chrome/Edge
2. Tap the "Install" prompt (or menu → "Install app")
3. Confirm installation
4. App appears on home screen

#### iOS (Safari)
1. Open the app in Safari
2. Tap the Share button
3. Select "Add to Home Screen"
4. Confirm and name the app

#### Desktop (Chrome/Edge)
1. Click the install icon in the address bar
2. Or: Menu → "Install Nodus"
3. App opens in standalone window

### 2. PWA Features

#### Offline Support
- **Service Worker**: Caches static assets
- **Network-first**: API calls with fallback
- **Cache-first**: Images and fonts
- **Auto-update**: Service worker updates automatically

#### Caching Strategy

**Static Assets** (Cache First):
- HTML, CSS, JavaScript files
- App icons and images
- Fonts (Google Fonts)

**API Calls** (Network First with 5min cache):
```javascript
/api/* → Fresh data preferred, cached fallback
```

**Uploaded Pictures** (Cache First with 30-day expiration):
```javascript
/uploads/* → Long-term caching for better performance
```

#### Manifest Configuration

The app includes a web manifest with:
- **Name**: "Nodus - Scout Installation Photos"
- **Short name**: "Nodus"
- **Display mode**: Standalone (fullscreen app experience)
- **Orientation**: Portrait-primary (optimized for mobile)
- **Theme color**: Brown (#795548)
- **Background color**: Light khaki (#f5f1e8)

#### App Icons

Generated icons for all device sizes:
- 72x72 (Android small)
- 96x96 (Android)
- 128x128 (Android, iOS)
- 144x144 (Windows)
- 152x152 (iOS)
- 192x192 (Android, iOS, Standard)
- 384x384 (Android hi-res)
- 512x512 (Splash screens)

All icons are **maskable**, meaning they adapt to different device shapes (rounded, squircle, etc.)

### 3. Development

#### Generate Icons
```bash
cd frontend
npm run generate-icons
```

This creates all required icon sizes in `/public/icons/`.

#### Test PWA
```bash
cd frontend
npm run dev
```

Visit `http://localhost:5173` and:
1. Open DevTools → Application → Service Workers
2. Check "Update on reload" for development
3. Test install prompt
4. Verify offline mode

#### Build for Production
```bash
cd frontend
npm run build
```

The PWA is automatically configured via `vite-plugin-pwa`.

### 4. Browser Support

| Browser | Mobile Support | PWA Support | Notes |
|---------|---------------|-------------|-------|
| Chrome (Android) | ✅ Full | ✅ Full | Best experience |
| Safari (iOS) | ✅ Full | ⚠️ Limited | Manual install only |
| Edge (Android) | ✅ Full | ✅ Full | Same as Chrome |
| Firefox (Android) | ✅ Full | ⚠️ Limited | Basic PWA |
| Samsung Internet | ✅ Full | ✅ Full | Good support |

### 5. Mobile-First CSS

The application uses mobile-first CSS with progressive enhancement:

```css
/* Base styles: Mobile */
.container {
  padding: 0 var(--spacing-md);
}

/* Tablet and up */
@media (min-width: 768px) {
  .container {
    padding: 0 var(--spacing-lg);
  }
}
```

Key mobile CSS features:
- **Flexible layouts**: Flexbox and CSS Grid
- **Fluid typography**: `clamp()` for responsive text
- **Touch optimizations**: Larger tap targets on mobile
- **Performance**: Hardware-accelerated animations

### 6. Testing

#### Mobile Testing Checklist

- [ ] Test on actual mobile devices (iOS and Android)
- [ ] Verify touch targets are at least 44x44px
- [ ] Check text is readable without zooming
- [ ] Ensure forms don't trigger unwanted zoom
- [ ] Test landscape and portrait orientations
- [ ] Verify images load and scale properly
- [ ] Test on slow 3G connection
- [ ] Check PWA installation flow
- [ ] Verify offline functionality
- [ ] Test app updates correctly

#### Tools
- **Chrome DevTools**: Mobile emulation
- **Lighthouse**: PWA audit
- **WebPageTest**: Performance testing
- **BrowserStack**: Real device testing

### 7. Known Limitations

1. **iOS Safari**: No automatic install prompt (manual only)
2. **Firefox**: Limited PWA support
3. **Offline mode**: Some features require network
4. **Push notifications**: Not implemented (future feature)

### 8. Future Enhancements

Potential improvements:
- [ ] Push notifications for new uploads
- [ ] Background sync for uploads
- [ ] Share target API for sharing photos to app
- [ ] Periodic background sync for updates
- [ ] Install shortcuts for quick actions
- [ ] Advanced caching strategies per user role

## Mobile Usage Tips

For best mobile experience:

1. **Install the app**: Add to home screen for app-like experience
2. **Enable notifications**: (when implemented) Stay updated
3. **Use in good lighting**: Better for photo uploads
4. **Keep updated**: Allow automatic app updates
5. **Clear cache occasionally**: If experiencing issues

## Support

For mobile-specific issues:
1. Check browser compatibility
2. Ensure service worker is registered
3. Clear browser cache and reinstall
4. Test on updated browser version
5. Report issues with device/browser details

## Technical Details

### Service Worker Registration

Automatically registered via Vite PWA plugin:
```javascript
// Auto-generated in dist/sw.js
registerType: 'autoUpdate'
```

### Cache Names
- `google-fonts-cache`: Google Fonts (1 year)
- `gstatic-fonts-cache`: Font files (1 year)
- `api-cache`: API responses (5 minutes)
- `images-cache`: Uploaded images (30 days)

### Updates
The service worker checks for updates every time the app loads and updates automatically in the background.

---

**Last Updated**: November 2025
**Version**: 1.0.0
