import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'oekit',
  description: 'Open Easy Kit — 开源易用的 Go 工具集：21 个独立发版的模块矩阵',
  cleanUrls: false,
  head: [
    ['link', { rel: 'icon', type: 'image/x-icon', href: '/favicon.ico' }]
  ],
  themeConfig: {
    siteTitle: 'oekit',
    logo: '/logo.png',
    nav: [
      { text: '首页', link: '/' },
      { text: '指南', link: '/guide/getting-started' },
      { text: '参考文档', items: [
        { text: '架构总览', link: '/about/architecture' },
        { text: '平台契约', link: '/about/PLATFORM_CONTRACT' },
        { text: '服务模板', link: '/about/SERVICE_TEMPLATE' },
        { text: 'llms.txt', link: '/llms.txt' }
      ]},
      { text: 'GitHub', link: 'https://github.com/orgs/oekit/repositories' }
    ],
    sidebar: {
      '/guide/': [
        {
          text: '指南',
          items: [
            { text: '01 快速开始', link: '/guide/getting-started' },
            { text: '02 日志（logx）', link: '/guide/logging' },
            { text: '03 错误处理', link: '/guide/errors' },
            { text: '04 HTTP 服务全栈', link: '/guide/http-service' },
            { text: '05 RPC 服务（Kitex）', link: '/guide/rpc-service' },
            { text: '06 可观测性', link: '/guide/observability' },
            { text: '07 迁移指南', link: '/guide/migration' },
            { text: '08 AI Agent 使用', link: '/guide/ai-agent' }
          ]
        },
        {
          text: '参考文档',
          items: [
            { text: '架构总览', link: '/about/architecture' },
            { text: '平台契约', link: '/about/PLATFORM_CONTRACT' },
            { text: '服务模板', link: '/about/SERVICE_TEMPLATE' }
          ]
        }
      ],
      '/about/': [
        {
          text: '参考文档',
          items: [
            { text: '架构总览', link: '/about/architecture' },
            { text: '平台契约', link: '/about/PLATFORM_CONTRACT' },
            { text: '服务模板', link: '/about/SERVICE_TEMPLATE' },
            { text: '指南目录', link: '/guide/getting-started' }
          ]
        }
      ]
    },
    socialLinks: [{ icon: 'github', link: 'https://github.com/oekit' }],
    outline: [2, 3],
    footer: {
      message: 'Open Easy Kit · MIT License',
      copyright: 'Copyright © 2026 oekit'
    }
  }
})
