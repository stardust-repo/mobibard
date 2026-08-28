export default {
  code: 'zh-CN', htmlLang: 'zh-Hans', strings: {
    'nav.simple_generator': '简易生成器', 'nav.detail_generator': '详细生成器',
    'settings.menu': '设置',
    'site.title': 'Mobibard v5.2', 'nav.products': '产品导航', 'language.label': '语言', 'language.select': '选择语言',
    'ui.brand': 'Mobibard', 'ui.recommended': '推荐网站', 'ui.select_recommended': '选择推荐网站', 'ui.discord': 'Discord',
    'account.menu': '账户菜单', 'account.guest': '访客', 'theme.label': '主题', 'theme.change': '切换主题',
    'theme.toggle': '切换主题', 'theme.to_light': '切换到浅色主题', 'theme.to_dark': '切换到深色主题',
    'product.subtitle': '读取钢琴卷帘视频中的键盘，并转换为 MIDI。',
    'video.title': '视频与键盘设置', 'video.description': '添加视频，然后将白键与黑键检测线调整到琴键靠下的位置。',
    'file.select': '选择视频', 'file.prompt': '选择视频文件或拖放到这里。', 'preview.aria': '视频画面与琴键检测线', 'preview.empty_title': '请添加钢琴卷帘视频。', 'preview.empty_body': '可以直接在视频上查看检测线和实际采样区域。',
    'transport.play': '▶ 播放', 'transport.pause': '❚❚ 暂停', 'transport.prev_frame': '−1F', 'transport.next_frame': '+1F', 'transport.timeline': '视频位置', 'transport.current_chord': '当前检测和弦', 'transport.after_analysis': '分析后显示',
    'guide.white_key': '白键', 'guide.black_key': '黑键', 'guide.white_hint': '拖动青色线', 'guide.black_hint': '拖动粉色线', 'guide.box_hint': '线上的小框就是实际颜色采样区域。',
    'keyboard.no_video': '尚未加载视频。', 'keyboard.adjust_guides': '请将检测线对准琴键。', 'keyboard.baseline_none': '无基准色', 'keyboard.baseline_fixed': '在 {time} 帧固定基准色',
    'keyboard.status_ok': '白键 {white} · 黑键 {black} · 线上的小框是实际采样区域。 · {baseline}', 'keyboard.status_invalid': '白键 {white} · 黑键 {black} · {invalid} 个红色黑键框位于键体之外，将从分析中排除。 · {baseline}', 'keyboard.detect_failed_hint': '无法找到琴键边界。请把白键/黑键检测线移动到琴键主体上。',
    'analysis.title': '分析与 MIDI 输出', 'analysis.description': '设置分析区间与 MIDI 参数后开始分析。', 'analysis.range': '分析时间', 'analysis.start_seconds': '开始 (秒)', 'analysis.end_seconds': '结束 (秒)', 'analysis.current': '当前', 'analysis.invalid_range': '分析结束时间必须晚于开始时间。', 'analysis.check_range': '请检查分析时间。',
    'settings.leftmost_white': '最左侧白键', 'settings.tempo': '速度 (BPM)', 'settings.velocity': '力度', 'actions.reset': '重置', 'actions.analyze': '分析视频', 'actions.cancel': '停止分析', 'actions.cancel_requested': '正在停止…', 'actions.download': '下载 MIDI',
    'progress.waiting': '等待中', 'progress.select_video': '请选择视频。', 'progress.generated_notes': '生成音符', 'progress.ready': '准备完成', 'progress.ready_detail': '青色线对准白键，粉色线对准黑键主体。', 'progress.idle_detail': '调整两条检测线后运行视频分析。', 'progress.opening': '正在打开视频', 'progress.opening_detail': '正在检查视频轨道。',
    'progress.frame_analysis': '帧分析', 'progress.frame_range': '正在读取 {start} ~ {end}。', 'progress.frame_count': '{count} 帧 · {current} / {duration}', 'progress.cancelled': '分析已停止', 'progress.cancelled_detail': '已处理 {count} 帧。', 'progress.color_compare': '比较琴键颜色 · 去除周边特效', 'progress.done': '完成', 'progress.notes_made': '已生成 {count} 个 MIDI 音符。', 'progress.analysis_error': '分析错误', 'progress.runtime_check': '需要检查运行环境', 'progress.library_error': '库错误', 'progress.error': '错误',
    'toast.baseline_fixed': '已将当前帧({time})的琴键颜色固定为基准色。', 'toast.detect_updated': '已更新琴键采样区域。', 'toast.detect_failed': '无法找到琴键边界。', 'toast.reset': '已恢复初始检测线位置与基准色。', 'toast.baseline_missing': '没有琴键基准色。请重新调整检测线以采集基准色。', 'toast.midi_done': 'MIDI 生成完成。', 'toast.no_notes': '未检测到音符。', 'toast.no_video_file': '未找到视频文件。', 'toast.analysis_error': '分析过程中发生错误。',
    'error.media_library': '无法加载视频库。', 'error.unsupported_video': '视频不受支持或已损坏。', 'error.no_video_track': '未找到视频轨道。', 'error.codec': '当前浏览器无法解码此视频编码。', 'error.open_video': '无法打开视频。', 'error.no_frames': '没有可分析的帧。', 'error.webcodecs': '当前浏览器不支持 WebCodecs。请使用最新的 Chrome 或 Edge。', 'error.secure_context': 'WebCodecs 需要 HTTPS 或 localhost。', 'error.library_load': '无法加载视频处理库。',
    'error.feature_key_count': 'FeatureStore 键数无效。', 'error.feature_size': '帧颜色数据必须为 {bytes} 字节。', 'error.key_count_mismatch': '琴键数量与分析特征数量不一致。', 'error.baseline_missing': '没有从键盘设置帧中采集到基准色。请重新调整检测线。', 'error.region_small': '选择区域太小。', 'error.white_boundaries': '无法找到足够的白键边界。请尝试其他参考帧或调整检测线。',
    'overlay.white': '白键', 'overlay.black': '黑键', 'analysis.post_detail': '固定未按下颜色 + 去除周边特效 {processed} / {total} 帧', 'analysis.post_done': '已生成 {count} 个音符。'
  }
};
