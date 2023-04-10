import type { parseLiterals as _parseLiterals } from "parse-literals"
declare const parseLiterals: typeof _parseLiterals

const fileRegex = /\.(ts)$/

/** 
	Finds all the html templates in the source code and converts them to cached html templates
	html template is html`<div>hello</div>` replace it with __html0`<div>hello</div>` 0 is the index number, every match has their own index number
	and define the cache at the top of the file with const __html0 = createCachedHtml()
	check if file imports `html` from `master-ts/library/template check if `html` is changed using as 
	@param src - source code
	@returns - source code with all the html templates converted to cached html templates
 */
export function preprocess(src: string, filename: string) {
	if (!fileRegex.test(filename)) return

	const htmlTag = findImportStatement(src, "master-ts/library/template", "html")
	const cssTag = findImportStatement(src, "master-ts/library/template", "css")

	let htmlCachersCount = 0
	{
		const toReplace: { start: number; end: number; replace: string }[] = []
		parseLiterals(src).forEach((template) => {
			if (htmlTag && template.tag === htmlTag) {
				if (!template.parts[0]) return
				const endOfTag = template.parts[0].start - 1
				toReplace.push({ start: endOfTag - htmlTag.length, end: endOfTag, replace: `__html${htmlCachersCount++}` })
				template.parts.forEach((part) => toReplace.push({ start: part.start, end: part.end, replace: minifyHtml(part.text) }))
			} else if (cssTag && template.tag === cssTag) {
				template.parts.forEach((part) => toReplace.push({ start: part.start, end: part.end, replace: minifyCss(part.text) }))
			}
		})

		let offset = 0
		toReplace.sort((a, b) => a.start - b.start)
		toReplace.forEach(({ start, end, replace }) => {
			src = replacePartOfString(src, start + offset, end + offset, replace)
			offset += replace.length - (end - start)
		})
	}

	if (htmlCachersCount === 0) return src

	// add the import to the top of the file
	const addedImport = addImport(src, "master-ts/library/template/cache", "createCachedHtml")
	src = addedImport.src
	const createCachedHtmlStatement = addedImport.statement

	// add the cachers to the top of the file
	for (let i = 0; i < htmlCachersCount; i++) src = addToTop(src, `const __html${i} = ${createCachedHtmlStatement}()`)

	return src
}

/**
 *
 * @param src
 * @param start
 * @param end
 * @param replace
 * @returns replaced
 */
function replacePartOfString(src: string, start: number, end: number, replace: string) {
	return `${src.substring(0, start)}${replace}${src.substring(end)}`
}

/**
 * Add import to file if it doesn't exist
 * if the import exists, and statement doesn't exist, add the statement to the import
 *
 * So for example addImport(src, "master-ts/library/template/cache", "createCachedHtml") will add
 * import { createCachedHtml } from "master-ts/library/template/cache"
 * But if:
 * `import { createCachedHtml } from "master-ts/library/template/cache"` already exists, will keep the src the same and return `createCachedHtml`
 * `import { createCachedHtml, foo } from "master-ts/library/template/cache"` already exists, will keep the src the same and return `createCachedHtml`
 * `import { createCachedHtml as bar, foo } from "master-ts/library/template/cache"` already exists, will keep the src the same and return `bar`
 *
 * Returns { src: string, statement: string }
 * @param src - source code
 * @param from - import from
 * @param importStatement - import statement
 * @returns {{ src: string, statement: string }} - source code with the import added and the import statement
 * @example addImport(src, "master-ts/library/template/cache", "createCachedHtml")
 */
function addImport(src: string, from: string, importStatement: string) {
	// find the import
	const importRegex = new RegExp(`import\\s*\\{\\s*([^}]+)\\s*\\}\\s*from\\s*["']${from}["']`, "g")
	const importMatch = src.match(importRegex)
	if (importMatch) {
		// find the statement
		const statementRegex = new RegExp(`\\s*${importStatement}\\s*(as\\s*\\w+)?\\s*`, "g")
		const statementMatch = importMatch[0].match(statementRegex)
		if (statementMatch) {
			// return the statement name
			const statementName = statementMatch[0]
				.replace(/(as\s*)?(\w+)/, "$2")
				.split(" as ")
				.map((s) => s.trim())
			return { src, statement: statementName[statementName.length - 1] }
		} else {
			// add the statement to the import
			const importIndex = src.indexOf(importMatch[0])
			const importEndIndex = importIndex + importMatch[0].length
			src = `${src.slice(0, importEndIndex - 1)}, ${importStatement}${src.slice(importEndIndex - 1)}`
			return { src, statement: importStatement }
		}
	} else {
		// add the import to the top of the file
		src = `import { ${importStatement} } from "${from}"\n${src}`
		return { src, statement: importStatement }
	}
}

/**
 * Add a code to the top of the file after the imports
 * @param src - source code
 * @param code - code to add
 * @returns - source code with the code added
 * @example addToTop(src, "const html1 = createCachedHtml()")
 */
function addToTop(src: string, code: string) {
	// find the first line that doesn't start with import
	const firstLine = src.match(/^(?!import).*$/m)?.[0]
	if (!firstLine) return src
	// find the index of the first line that doesn't start with import
	const firstLineIndex = src.indexOf(firstLine)
	// add the code to the top of the file
	src = `${src.slice(0, firstLineIndex)}${code}\n${src.slice(firstLineIndex)}`
	return src
}

/**
 * Check if the file includes the import and import includes the statement and return the statement
 * If the import doesn't exist, return null

 * @param src - source code
 * @param from - import from
 * @param importStatement - import statement
 * @returns - import statement name
 * @example findImportName(src, "master-ts/library/template", "html")
 */
function findImportStatement(src: string, from: string, importStatement: string) {
	// find the import
	const importRegex = new RegExp(`import\\s*\\{\\s*([^}]+)\\s*\\}\\s*from\\s*["']${from}["']`, "g")
	const importMatch = src.match(importRegex)
	if (!importMatch) return null

	// find the statement
	const statementRegex = new RegExp(`\\s*${importStatement}\\s*(as\\s*\\w+)?\\s*`, "g")
	const statementMatch = importMatch[0].match(statementRegex)
	if (!statementMatch) return null

	// return the statement name
	const statementName = statementMatch[0]
		.replace(/(as\s*)?(\w+)/, "$2")
		.split(" as ")
		.map((s) => s.trim())
	return statementName[statementName.length - 1]
}

/**
 * Minify the HTML
 * @param html - html code
 * @returns - minified html code
 */
function minifyHtml(html: string) {
	// remove all whitespace that is not inside a string
	return html.replace(/([^"'])(\s+)/g, "$1 ")
}

/**
 * Minify the CSS
 * @param css - css code
 * @returns - minified css code
 */
function minifyCss(css: string) {
	// remove all whitespace that is not inside a string
	css = css.replace(/([^"'])(\s+)/g, "$1 ")

	return css
}
