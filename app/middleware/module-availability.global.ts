import { isModuleEnabled, moduleIdForPublicPath } from '#shared/admin/modules'

export default defineNuxtRouteMiddleware((to) => {
	if (to.path === '/')
		return
	const moduleId = moduleIdForPublicPath(to.path)
	if (!moduleId)
		return
	const appConfig = useAppConfig()
	if (isModuleEnabled(appConfig.featureModules, moduleId))
		return
	throw createError({
		statusCode: 404,
		statusMessage: '模块已停用',
		message: '该公开模块当前已在站点配置中停用。',
	})
})
