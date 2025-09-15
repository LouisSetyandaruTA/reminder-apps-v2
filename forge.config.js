const { FusesPlugin } = require('@electron-forge/plugin-fuses');
const { FuseV1Options, FuseVersion } = require('@electron/fuses');
const { VitePlugin } = require('@electron-forge/plugin-vite'); // Import the VitePlugin class

module.exports = {
  packagerConfig: {
    asar: true,
    icon: 'assets/Logo_Solahart',
    extraResource: ['scripts']
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
        icon: 'assets/Logo_Solahart.icns'
      }
    },
    {
      name: '@electron-forge/maker-deb',
      config: {
        icon: 'assets/Logo_Solahart.png'
      },
    },
    {
      name: '@electron-forge/maker-rpm',
      config: {
        icon: 'assets/Logo_Solahart.png'
      },
    },
  ],
  plugins: [
    // Use the VitePlugin constructor for proper initialization
    new VitePlugin({
      build: [
        {
          // The 'main' process entry file
          entry: 'src/main.js',
          config: 'vite.main.config.mjs',
        },
        {
          // The 'preload' script entry file
          entry: 'src/preload.js',
          config: 'vite.preload.config.mjs',
        },
      ],
      renderer: [
        {
          name: 'main_window',
          config: 'vite.renderer.config.mjs',
        },
        {
          name: 'reminder_window',
          config: 'vite.renderer.config.mjs',
        },
      ],
    }),

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