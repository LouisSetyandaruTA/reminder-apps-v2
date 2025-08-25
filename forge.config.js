const { FusesPlugin } = require('@electron-forge/plugin-fuses');
const { FuseV1Options, FuseVersion } = require('@electron/fuses');

module.exports = {
  packagerConfig: {
    asar: true,
    // Gunakan path tanpa ekstensi, Electron Forge akan menemukan yang benar secara otomatis
    icon: 'assets/Logo_Solahart' 
  },
  rebuildConfig: {},
  makers: [
    {
      name: '@electron-forge/maker-squirrel',
      config: {
        setupIcon: 'assets/Logo_Solahart.ico',
      },
    },
    {
      name: '@electron-forge/maker-zip',
      platforms: ['darwin'],
      config: {
        // Gunakan path ke file ikon .icns untuk macOS
        icon: 'assets/Logo_Solahart.icns'
      }
    },
    {
      name: '@electron-forge/maker-deb',
      config: {
        // Gunakan path ke file ikon .png untuk Linux
        icon: 'assets/Logo_Solahart.png'
      },
    },
    {
      name: '@electron-forge/maker-rpm',
      config: {
        // Gunakan path ke file ikon .png untuk Linux
        icon: 'assets/Logo_Solahart.png'
      },
    },
  ],
  plugins: [
    {
      name: '@electron-forge/plugin-vite',
      config: {
        build: [
          {
            entry: 'src/main.js',
            config: 'vite.main.config.mjs',
            target: 'main',
          },
          {
            entry: 'src/preload.js',
            config: 'vite.preload.config.mjs',
            target: 'preload',
          },
        ],
        renderer: [
          {
            name: 'main_window',
            config: 'vite.renderer.config.mjs',
          },
        ],
      },
    },
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
};