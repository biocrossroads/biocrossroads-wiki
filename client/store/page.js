import { make } from 'vuex-pathify'

const state = {
  id: 0,
  authorId: 0,
  authorName: 'Unknown',
  createdAt: '',
  description: '',
  isPublished: true,
  locale: 'en',
  path: '',
  publishEndDate: '',
  publishStartDate: '',
  tags: [],
  title: '',
  updatedAt: '',
  editor: '',
  mode: '',
  scriptJs: '',
  minTocLevel: 0,
  tocLevel: 2,
  tocCollapseLevel: 2,
  doUseTocDefault: true,
  scriptCss: '',
  effectivePermissions: {
    comments: {
      read: false,
      write: false,
      manage: false
    },
    history: {
      read: false
    },
    source: {
      read: false
    },
    pages: {
      write: false,
      manage: false,
      delete: false,
      script: false,
      style: false
    },
    system: {
      manage: false
    }
  },
  commentsCount: 0
}

export default {
  namespaced: true,
  state,
  mutations: make.mutations(state)
}
