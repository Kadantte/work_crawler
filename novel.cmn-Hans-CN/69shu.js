﻿/**
 * 批量下載 69书吧 的工具。 Download 69shu novels.
 */

'use strict';

require('../work_crawler_loader.js');

// ----------------------------------------------------------------------------

CeL.run([ 'application.storage.EPUB'
// CeL.detect_HTML_language()
, 'application.locale' ]);

// ----------------------------------------------------------------------------

var crawler = new CeL.work_crawler({
	// auto_create_ebook, automatic create ebook
	// MUST includes CeL.application.locale!
	need_create_ebook : true,
	// recheck:從頭檢測所有作品之所有章節與所有圖片。不會重新擷取圖片。對漫畫應該僅在偶爾需要從頭檢查時開啟此選項。default:false
	// recheck='changed': 若是已變更，例如有新的章節，則重新下載/檢查所有章節內容。否則只會自上次下載過的章節接續下載。
	// recheck : 'changed',

	// Using AmazonS3
	search_work_interval : '2s',
	// 速度過快會被封鎖數個小時。
	chapter_time_interval : '2s',

	// 2018/2/4前: https://www.69shu.com/
	// 2023/8/18前改: https://www.69shuba.com/
	// 2024/1/29前改: https://www.69xinshu.com/
	// 2024/3/13前改: https://www.69shu.pro/
	// 2024/5/5前改: https://www.69shu.top/
	// 2024/8/1前改: https://69shuba.cx/
	base_URL : 'https://69shuba.cx/',
	charset : 'gbk',

	// 解析 作品名稱 → 作品id get_work()
	search_URL : function(work_title) {
		return [ 'modules/article/search.php', {
			// 2023/8/18
			// searchtype : 'all',

			searchkey : work_title,
			// 2024/1/29 +
			submit : 'Search'
		} ];
	},
	parse_search_result : function(html, get_label) {
		// console.log(html);
		var id_data = [],
		// {Array}id_list = [id,id,...]
		id_list = [];

		function parse_section(text) {
			var matched = text.match(
			/**
			 * 2023/8/18<code>
			<li>

			...

			<h3><a target="_blank" href="https://www.69shuba.com/book/47114.htm"><span class="hottext">苟</span><span class="hottext">在</span><span class="hottext">仙</span><span class="hottext">武</span><span class="hottext">娶妻</span><span class="hottext">长生</span></a></h3>
			</code>
			 * 
			 * 2024/1/29<code>
			<li>

			...

			<h3><a target="_blank" href="https://www.69xinshu.com/book/47093.htm">我为长生仙</a></h3>
			</code>
			 */
			/<a [^<>]*?href="[^"]+?\/(\d+)\.htm">([\s\S]+?)<\/a>/);
			id_list.push(matched[1]);
			id_data.push(get_label(matched[2]));
		}

		var text = html.between('<h1>', '</h1>');
		if (text) {
			// 直接跳轉到作品資訊頁面。
			parse_section(text);
		} else {
			/**
			 * <code>
			<!--头部内容结束-->
			<div class="container">
			<div class="mybox">
			<ul class="row">
			    <li class="col-88">
			</code>
			 */
			html = html.between('<div class="container">').between('<ul',
					'</ul>');
			html = html.between('<ul>') || html;
			// console.trace(html);
			html.each_between('<li>', null, function(text) {
				// console.trace(text);
				parse_section(text.between('<h3>', '</h3>'));
			});
		}

		// console.log([ id_list, id_data ]);
		return [ id_list, id_data ];
	},

	// 取得作品的章節資料。 get_work_data()
	work_URL : function(work_id) {
		return 'txt/' + work_id + '.htm';
	},
	parse_work_data : function(html, get_label, extract_work_data) {
		// console.trace(html);
		if (!this.site_name) {
			// <a href="https://www.69shu.com">69书吧</a>
			this.site_name = get_label(html.between('<div class="logoimg">')
					.between('<a ', '</a>').between('>'));
		}
		var text = html.between('<div class="container">');
		// console.log(text);
		var work_data = {
			// 必要屬性：須配合網站平台更改。
			/**
			 * <code>
			<h2>最仙遊<span>文 / <a href="/fxnlist/虾写.html">虾写</a></span></h2>
			</code>
			 */
			title : get_label(text.between('<h1>', '</h1>')),

			// 選擇性屬性：須配合網站平台更改。
			tags : text.between('<ul class="tagul">', '</ul>').all_between(
					'<a ', '</a>').map(function(text) {
				return get_label(text.between('>'));
			})
		};

		text = html.between('var bookinfo =', '</script>');
		eval('text = ' + text);
		// console.trace(text);
		Object.assign(work_data, text);
		if (!work_data.site_name && work_data.siteName)
			work_data.site_name = work_data.siteName;

		// 由 meta data 取得作品資訊。
		extract_work_data(work_data, html);

		if (work_data.tags && work_data.tags.includes('|')) {
			work_data.tags = work_data.tags.split('|').filter(function(tag) {
				return !!tag;
			});
		}

		work_data.last_update = work_data.update_time;

		// console.log(html);
		// console.log(work_data);
		return work_data;
	},
	// 對於章節列表與作品資訊分列不同頁面(URL)的情況，應該另外指定.chapter_list_URL。
	chapter_list_URL : function(work_id) {
		return work_id + '/';
	},
	get_chapter_list : function(work_data, html, get_label) {
		// <div class="catalog" id="catalog">
		// <h3>目录</h3>

		html = html.between(' id="catalog"').between('<ul>', '</ul>');

		// reset work_data.chapter_list
		work_data.chapter_list = [];
		html.each_between('<li', '</li>', function(text) {
			var matched = text
					.match(/<a href="([^<>"]+)"[^<>]*>([\s\S]+?)<\/a>/);
			var chapter_data = {
				url : matched[1],
				title : get_label(matched[2])
			};

			crawler.add_chapter(work_data, chapter_data);
		});

		crawler.reverse_chapter_list_order(work_data);

		this.trim_chapter_NO_prefix(work_data);

		// console.log(work_data.chapter_list);
	},

	// 取得每一個章節的各個影像內容資料。 get_chapter_data()
	parse_chapter_data : function(html, work_data, get_label, chapter_NO) {
		// console.log(html);

		html = html.between('<div class="txtnav">') || html;
		this.check_next_chapter(work_data, chapter_NO, html);

		var chapter_data = work_data.chapter_list[chapter_NO - 1];
		// 以章節中的標題為準，目錄中的可能被截斷。
		chapter_data.title = get_label(html.between('<h1', '</h1>')
		// <h1 class="hide720">第733章 一个人的比赛有什么意思，人多才热闹</h1>
		.between('>')) || chapter_data.title;
		this.trim_chapter_NO_prefix(chapter_data, chapter_NO);

		/**
		 * <code>
		<div class="txtinfo hide720"><span>2022-09-21</span> <span>作者： 最白的乌鸦</span></div>
		</code>
		 */
		var text = html.between('<div class="txtinfo', '</div>');
		var matched = text.match(/<span>(\d{4}-\d{2}-\d{2})<\/span>/);
		if (matched)
			chapter_data.date = matched[1];

		html = html.between('<div id="txtright">').between('</div>')
				|| html.between('</h1>');
		// console.log(html);
		html = html.between(null, '<div class="bottom-ad">')
				|| text.between(null, '</div>');
		// console.log(html);

		// 有些章節會先以章節標題起頭。
		text = CeL.work_crawler.trim_start_title(html, chapter_data);

		/**
		 * <code>
		https://www.69shuba.com/txt/51594/33706898	请公子斩妖 第788章 神器回来了 【求月票！】
		以后东躲XZ的日子就过去了，
		</code>
		 */
		text = CeL.work_crawler.fix_general_censorship(text);

		text = CeL.work_crawler.fix_general_ADs(text);

		/**
		 * <code>

		// https://www.69shuba.com/txt/51594/33699533	請公子斬妖 > 第3章 換劍閣
		&emsp;&emsp;<div class="contentadv"><script>loadAdv(7,3);</script></div>

		</code>
		 */
		text = text.replace(/<script[^<>]*>[\s\S]*?<\/script>/g, '');
		/**
		 * <code>

		// https://69shuba.cx/txt/47093/31443846	我为长生仙 > 第1章 山下少年
		你觉得如何。”<div class="contentadv"><script>loadAdv(7,3);</script></div>那女子白了丈夫一眼，

		</code>
		 */
		text = text.replace(/(?:&emsp;)*<div class="contentadv"><\/div>/g,
				'<br /><br />');

		text = text.replace(/(?:<br[^<>]*>)+<\/p>/ig, '</p>');

		// console.trace([ html, text ]);
		this.add_ebook_chapter(work_data, chapter_NO, text);
	}
});

// ----------------------------------------------------------------------------

// CeL.set_debug(3);

start_crawler(crawler, typeof module === 'object' && module);
