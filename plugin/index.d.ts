import type { parseTemplateDescriptor as parseTemplateDescriptor_ } from "master-ts/library/template/parse/descriptor"
import type { parseTemplateHtml as parseTemplateHtml_ } from "master-ts/library/template/parse/html"
import type typescript_ from "typescript"

export function masterTsPlugin(
	typescript: typeof typescript_,
	parseTemplateHtml: typeof parseTemplateHtml_,
	parseTemplateDescriptor: typeof parseTemplateDescriptor_
): {
	name: "transform-file"
	transform(src: string, filename: string): { code: string }
}
