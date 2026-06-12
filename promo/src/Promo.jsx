import {
	AbsoluteFill,
	Sequence,
	interpolate,
	spring,
	useCurrentFrame,
	useVideoConfig,
} from 'remotion';

const COLORS = {
	bg: '#050505',
	bgAlt: '#0b0f14',
	cyan: '#22d3ee',
	white: '#ffffff',
	glass: 'rgba(255,255,255,0.05)',
	glassBorder: 'rgba(255,255,255,0.12)',
};

const FONT =
	'-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

const Background = () => (
	<AbsoluteFill
		style={{
			background: `radial-gradient(ellipse 80% 60% at 50% 40%, ${COLORS.bgAlt} 0%, ${COLORS.bg} 70%)`,
		}}
	/>
);

const SceneFade = ({children, duration, fadeIn = 18, fadeOut = 18}) => {
	const frame = useCurrentFrame();
	const clamp = {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'};
	let opacity;
	if (fadeOut <= 0) {
		opacity = interpolate(frame, [0, fadeIn, duration], [0, 1, 1], clamp);
	} else if (duration - fadeOut <= fadeIn) {
		opacity = interpolate(frame, [0, duration], [0, 1], clamp);
	} else {
		opacity = interpolate(
			frame,
			[0, fadeIn, duration - fadeOut, duration],
			[0, 1, 1, 0],
			clamp,
		);
	}
	return (
		<AbsoluteFill style={{opacity}}>
			{children}
		</AbsoluteFill>
	);
};

const GlassCard = ({children, style = {}, glow = false}) => (
	<div
		style={{
			background: COLORS.glass,
			border: `1px solid ${COLORS.glassBorder}`,
			borderRadius: 16,
			backdropFilter: 'blur(12px)',
			boxShadow: glow
				? `0 0 40px rgba(34, 211, 238, 0.25), inset 0 1px 0 rgba(255,255,255,0.08)`
				: 'inset 0 1px 0 rgba(255,255,255,0.06)',
			...style,
		}}
	>
		{children}
	</div>
);

const SectionTitle = ({children, delay = 0}) => {
	const frame = useCurrentFrame();
	const {fps} = useVideoConfig();
	const progress = spring({
		frame: frame - delay,
		fps,
		config: {damping: 200, stiffness: 120},
	});
	const y = interpolate(progress, [0, 1], [30, 0]);
	const opacity = interpolate(progress, [0, 1], [0, 1]);
	return (
		<h2
			style={{
				fontFamily: FONT,
				fontSize: 42,
				fontWeight: 800,
				color: COLORS.white,
				textAlign: 'center',
				letterSpacing: '0.04em',
				textTransform: 'uppercase',
				margin: 0,
				opacity,
				transform: `translateY(${y}px)`,
			}}
		>
			{children}
		</h2>
	);
};

/* ── Scene 1: Title (0–180) ── */
const SceneTitle = () => {
	const frame = useCurrentFrame();
	const {fps} = useVideoConfig();

	const titleSpring = spring({frame, fps, config: {damping: 180, stiffness: 80}});
	const titleScale = interpolate(titleSpring, [0, 1], [0.85, 1]);
	const titleOpacity = interpolate(titleSpring, [0, 1], [0, 1]);

	const tagSpring = spring({
		frame: frame - 20,
		fps,
		config: {damping: 200, stiffness: 100},
	});
	const tagOpacity = interpolate(tagSpring, [0, 1], [0, 1]);
	const tagY = interpolate(tagSpring, [0, 1], [20, 0]);

	const glowPulse = interpolate(
		Math.sin(frame / 15),
		[-1, 1],
		[0.3, 0.7],
	);

	return (
		<SceneFade duration={180}>
			<AbsoluteFill
				style={{
					justifyContent: 'center',
					alignItems: 'center',
					flexDirection: 'column',
					gap: 28,
				}}
			>
				<div
					style={{
						position: 'absolute',
						width: 600,
						height: 300,
						borderRadius: '50%',
						background: `radial-gradient(circle, rgba(34,211,238,${glowPulse * 0.35}) 0%, transparent 70%)`,
						filter: 'blur(60px)',
					}}
				/>
				<h1
					style={{
						fontFamily: FONT,
						fontSize: 56,
						fontWeight: 900,
						color: COLORS.white,
						textAlign: 'center',
						letterSpacing: '0.06em',
						lineHeight: 1.15,
						margin: 0,
						opacity: titleOpacity,
						transform: `scale(${titleScale})`,
						textShadow: `0 0 ${30 + glowPulse * 40}px rgba(34,211,238,${glowPulse * 0.6})`,
					}}
				>
					GENERATIVEAI
					<br />
					<span style={{color: COLORS.cyan}}>SUPERCOMPUTER</span>
				</h1>
				<p
					style={{
						fontFamily: FONT,
						fontSize: 22,
						fontWeight: 400,
						color: 'rgba(255,255,255,0.75)',
						textAlign: 'center',
						maxWidth: 700,
						margin: 0,
						opacity: tagOpacity,
						transform: `translateY(${tagY}px)`,
						lineHeight: 1.5,
					}}
				>
					One chat. Describe a brief. Get production-ready media.
				</p>
			</AbsoluteFill>
		</SceneFade>
	);
};

/* ── Scene 2: Chat (180–450) ── */
const SceneChat = () => {
	const frame = useCurrentFrame();
	const {fps} = useVideoConfig();
	const localFrame = frame;

	const userSpring = spring({
		frame: localFrame - 15,
		fps,
		config: {damping: 200},
	});
	const userOpacity = interpolate(userSpring, [0, 1], [0, 1]);
	const userX = interpolate(userSpring, [0, 1], [-40, 0]);

	const planSpring = spring({
		frame: localFrame - 50,
		fps,
		config: {damping: 200},
	});
	const planOpacity = interpolate(planSpring, [0, 1], [0, 1]);
	const planY = interpolate(planSpring, [0, 1], [30, 0]);

	const steps = [
		'generate_image',
		'generate_video',
		'post to Slack',
	];

	return (
		<SceneFade duration={270}>
			<AbsoluteFill
				style={{
					justifyContent: 'center',
					alignItems: 'center',
					padding: 60,
					flexDirection: 'column',
					gap: 36,
				}}
			>
				<SectionTitle>One Chat, A Whole Creative Team</SectionTitle>
				<div style={{width: '100%', maxWidth: 720, display: 'flex', flexDirection: 'column', gap: 20}}>
					<div
						style={{
							alignSelf: 'flex-end',
							opacity: userOpacity,
							transform: `translateX(${userX}px)`,
						}}
					>
						<GlassCard style={{padding: '16px 24px', maxWidth: 480}}>
							<p style={{fontFamily: FONT, fontSize: 18, color: COLORS.white, margin: 0}}>
								Make a 15s TikTok ad for my sneakers
							</p>
						</GlassCard>
						<span
							style={{
								fontFamily: FONT,
								fontSize: 12,
								color: 'rgba(255,255,255,0.4)',
								float: 'right',
								marginTop: 6,
							}}
						>
							You
						</span>
					</div>
					<div
						style={{
							alignSelf: 'flex-start',
							opacity: planOpacity,
							transform: `translateY(${planY}px)`,
						}}
					>
						<GlassCard glow style={{padding: 24, width: 420}}>
							<div style={{display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16}}>
								<div
									style={{
										width: 28,
										height: 28,
										borderRadius: 8,
										background: `linear-gradient(135deg, ${COLORS.cyan}, #0891b2)`,
										display: 'flex',
										alignItems: 'center',
										justifyContent: 'center',
										fontSize: 14,
									}}
								>
									⚡
								</div>
								<span
									style={{
										fontFamily: FONT,
										fontSize: 14,
										fontWeight: 700,
										color: COLORS.cyan,
										textTransform: 'uppercase',
										letterSpacing: '0.08em',
									}}
								>
									Agent Plan
								</span>
							</div>
							{steps.map((step, i) => {
								const stepSpring = spring({
									frame: localFrame - 70 - i * 18,
									fps,
									config: {damping: 200},
								});
								const stepOpacity = interpolate(stepSpring, [0, 1], [0, 1]);
								const stepX = interpolate(stepSpring, [0, 1], [-20, 0]);
								return (
									<div
										key={step}
										style={{
											display: 'flex',
											alignItems: 'center',
											gap: 12,
											marginBottom: i < steps.length - 1 ? 12 : 0,
											opacity: stepOpacity,
											transform: `translateX(${stepX}px)`,
										}}
									>
										<span
											style={{
												fontFamily: 'monospace',
												fontSize: 13,
												color: COLORS.cyan,
												background: 'rgba(34,211,238,0.1)',
												padding: '4px 10px',
												borderRadius: 6,
												border: '1px solid rgba(34,211,238,0.25)',
											}}
										>
											{i + 1}
										</span>
										<span style={{fontFamily: FONT, fontSize: 16, color: COLORS.white}}>
											{step}
										</span>
										{i < steps.length - 1 && (
											<span style={{marginLeft: 'auto', color: 'rgba(255,255,255,0.3)', fontSize: 18}}>
												→
											</span>
										)}
									</div>
								);
							})}
						</GlassCard>
					</div>
				</div>
			</AbsoluteFill>
		</SceneFade>
	);
};

/* ── Scene 3: Swappable Brain (450–690) ── */
const SceneBrain = () => {
	const frame = useCurrentFrame();
	const {fps} = useVideoConfig();

	const providers = ['Claude', 'OpenAI', 'Gemini'];
	const cycleLength = 70;
	const activeIndex = Math.floor(frame / cycleLength) % providers.length;
	const cycleFrame = frame % cycleLength;

	return (
		<SceneFade duration={240}>
			<AbsoluteFill
				style={{
					justifyContent: 'center',
					alignItems: 'center',
					flexDirection: 'column',
					gap: 48,
				}}
			>
				<SectionTitle>Swappable Brain</SectionTitle>
				<div style={{display: 'flex', gap: 24, alignItems: 'center'}}>
					{providers.map((name, i) => {
						const isActive = i === activeIndex;
						const isPrev =
							i === (activeIndex - 1 + providers.length) % providers.length &&
							cycleFrame < 20;
						const highlight = isActive || isPrev;

						const pillSpring = spring({
							frame: frame - i * 8,
							fps,
							config: {damping: 200},
						});
						const scale = isActive
							? interpolate(
									spring({frame: cycleFrame, fps, config: {damping: 15, stiffness: 200}}),
									[0, 1],
									[1, 1.12],
								)
							: interpolate(pillSpring, [0, 1], [0.8, 1]);

						const opacity = interpolate(pillSpring, [0, 1], [0, 1]);

						return (
							<GlassCard
								key={name}
								glow={isActive}
								style={{
									padding: '20px 36px',
									opacity,
									transform: `scale(${scale})`,
									border: highlight
										? `1px solid rgba(34,211,238,0.5)`
										: `1px solid ${COLORS.glassBorder}`,
									background: isActive
										? 'rgba(34,211,238,0.12)'
										: COLORS.glass,
									transition: 'none',
								}}
							>
								<span
									style={{
										fontFamily: FONT,
										fontSize: 22,
										fontWeight: 700,
										color: isActive ? COLORS.cyan : 'rgba(255,255,255,0.7)',
									}}
								>
									{name}
								</span>
							</GlassCard>
						);
					})}
				</div>
				<p
					style={{
						fontFamily: FONT,
						fontSize: 18,
						color: 'rgba(255,255,255,0.5)',
						margin: 0,
					}}
				>
					Switch models without changing your workflow
				</p>
			</AbsoluteFill>
		</SceneFade>
	);
};

/* ── Scene 4: Memory + Skills (690–930) ── */
const SceneMemory = () => {
	const frame = useCurrentFrame();
	const {fps} = useVideoConfig();

	const memories = ['Working', 'Brand', 'Episodic'];
	const skills = ['/cinematic', '/montage', '/product', '/ugc'];

	return (
		<SceneFade duration={240}>
			<AbsoluteFill
				style={{
					justifyContent: 'center',
					alignItems: 'center',
					flexDirection: 'column',
					gap: 40,
					padding: 60,
				}}
			>
				<SectionTitle>Memory + Skills</SectionTitle>
				<div style={{display: 'flex', gap: 20}}>
					{memories.map((mem, i) => {
						const s = spring({frame: frame - 20 - i * 12, fps, config: {damping: 200}});
						return (
							<GlassCard
								key={mem}
								glow={i === 1}
								style={{
									padding: '28px 32px',
									opacity: interpolate(s, [0, 1], [0, 1]),
									transform: `translateY(${interpolate(s, [0, 1], [24, 0])}px)`,
									minWidth: 160,
									textAlign: 'center',
								}}
							>
								<div style={{fontSize: 28, marginBottom: 10}}>
									{i === 0 ? '🧠' : i === 1 ? '🎨' : '📚'}
								</div>
								<span
									style={{
										fontFamily: FONT,
										fontSize: 18,
										fontWeight: 700,
										color: COLORS.white,
									}}
								>
									{mem}
								</span>
								<div
									style={{
										fontFamily: FONT,
										fontSize: 13,
										color: 'rgba(255,255,255,0.45)',
										marginTop: 6,
									}}
								>
									memory
								</div>
							</GlassCard>
						);
					})}
				</div>
				<div style={{display: 'flex', gap: 14, flexWrap: 'wrap', justifyContent: 'center'}}>
					{skills.map((skill, i) => {
						const s = spring({frame: frame - 70 - i * 10, fps, config: {damping: 200}});
						return (
							<div
								key={skill}
								style={{
									fontFamily: 'monospace',
									fontSize: 15,
									color: COLORS.cyan,
									background: 'rgba(34,211,238,0.1)',
									border: '1px solid rgba(34,211,238,0.3)',
									borderRadius: 20,
									padding: '8px 18px',
									opacity: interpolate(s, [0, 1], [0, 1]),
									transform: `scale(${interpolate(s, [0, 1], [0.7, 1])})`,
								}}
							>
								{skill}
							</div>
						);
					})}
				</div>
			</AbsoluteFill>
		</SceneFade>
	);
};

/* ── Scene 5: AI Employees (930–1170) ── */
const SceneEmployees = () => {
	const frame = useCurrentFrame();
	const {fps} = useVideoConfig();

	const employees = [
		{emoji: '📸', title: 'Product Photographer'},
		{emoji: '🎬', title: 'Motion Designer'},
		{emoji: '🎙️', title: 'Podcast Producer'},
		{emoji: '🎨', title: 'Cartoon Animator'},
		{emoji: '📺', title: 'Ad Director'},
	];

	return (
		<SceneFade duration={240}>
			<AbsoluteFill
				style={{
					justifyContent: 'center',
					alignItems: 'center',
					flexDirection: 'column',
					gap: 36,
					padding: 50,
				}}
			>
				<SectionTitle>AI Employees</SectionTitle>
				<div
					style={{
						display: 'flex',
						gap: 16,
						flexWrap: 'wrap',
						justifyContent: 'center',
						maxWidth: 1100,
					}}
				>
					{employees.map((emp, i) => {
						const s = spring({frame: frame - 15 - i * 10, fps, config: {damping: 200}});
						return (
							<GlassCard
								key={emp.title}
								style={{
									padding: '20px 18px',
									width: 190,
									textAlign: 'center',
									opacity: interpolate(s, [0, 1], [0, 1]),
									transform: `translateY(${interpolate(s, [0, 1], [30, 0])}px) scale(${interpolate(s, [0, 1], [0.9, 1])})`,
								}}
							>
								<div style={{fontSize: 36, marginBottom: 10}}>{emp.emoji}</div>
								<span
									style={{
										fontFamily: FONT,
										fontSize: 14,
										fontWeight: 600,
										color: COLORS.white,
										lineHeight: 1.3,
									}}
								>
									{emp.title}
								</span>
							</GlassCard>
						);
					})}
				</div>
			</AbsoluteFill>
		</SceneFade>
	);
};

/* ── Scene 6: Connected (1170–1410) ── */
const ConnectorIcon = ({name, color}) => {
	const icons = {
		Slack: (
			<svg width="36" height="36" viewBox="0 0 36 36" fill="none">
				<rect x="4" y="14" width="8" height="14" rx="4" fill={color} />
				<rect x="14" y="4" width="14" height="8" rx="4" fill={color} />
				<rect x="24" y="14" width="8" height="14" rx="4" fill={color} />
				<rect x="8" y="24" width="14" height="8" rx="4" fill={color} />
			</svg>
		),
		'Google Drive': (
			<svg width="36" height="36" viewBox="0 0 36 36" fill="none">
				<polygon points="18,4 32,28 4,28" fill="none" stroke={color} strokeWidth="2.5" />
				<line x1="4" y1="28" x2="32" y2="28" stroke={color} strokeWidth="2.5" />
				<line x1="18" y1="4" x2="4" y2="28" stroke={color} strokeWidth="2.5" />
				<line x1="18" y1="4" x2="32" y2="28" stroke={color} strokeWidth="2.5" />
			</svg>
		),
		Gmail: (
			<svg width="36" height="36" viewBox="0 0 36 36" fill="none">
				<rect x="4" y="8" width="28" height="20" rx="3" stroke={color} strokeWidth="2.5" fill="none" />
				<polyline points="4,10 18,20 32,10" stroke={color} strokeWidth="2.5" fill="none" />
			</svg>
		),
		Notion: (
			<svg width="36" height="36" viewBox="0 0 36 36" fill="none">
				<rect x="6" y="6" width="24" height="24" rx="4" stroke={color} strokeWidth="2.5" fill="none" />
				<text x="18" y="23" textAnchor="middle" fill={color} fontSize="16" fontWeight="bold" fontFamily={FONT}>
					N
				</text>
			</svg>
		),
	};
	return icons[name] || null;
};

const SceneConnected = () => {
	const frame = useCurrentFrame();
	const {fps} = useVideoConfig();

	const connectors = [
		{name: 'Slack', color: '#E01E5A'},
		{name: 'Google Drive', color: '#4285F4'},
		{name: 'Gmail', color: '#EA4335'},
		{name: 'Notion', color: '#ffffff'},
	];

	return (
		<SceneFade duration={240}>
			<AbsoluteFill
				style={{
					justifyContent: 'center',
					alignItems: 'center',
					flexDirection: 'column',
					gap: 40,
				}}
			>
				<SectionTitle>Connected</SectionTitle>
				<div style={{display: 'flex', gap: 24}}>
					{connectors.map((conn, i) => {
						const lightUp = spring({
							frame: frame - 25 - i * 20,
							fps,
							config: {damping: 200},
						});
						const lit = interpolate(lightUp, [0, 1], [0, 1]);
						const glow = lit * 0.6;

						return (
							<GlassCard
								key={conn.name}
								glow={lit > 0.5}
								style={{
									padding: '24px 20px',
									width: 150,
									textAlign: 'center',
									opacity: interpolate(lightUp, [0, 1], [0.3, 1]),
									transform: `scale(${interpolate(lightUp, [0, 1], [0.85, 1])})`,
									boxShadow: `0 0 ${20 * glow}px rgba(34,211,238,${glow * 0.5})`,
								}}
							>
								<div style={{marginBottom: 12, display: 'flex', justifyContent: 'center'}}>
									<ConnectorIcon
										name={conn.name}
										color={lit > 0.5 ? COLORS.cyan : 'rgba(255,255,255,0.4)'}
									/>
								</div>
								<span
									style={{
										fontFamily: FONT,
										fontSize: 14,
										fontWeight: 600,
										color: lit > 0.5 ? COLORS.white : 'rgba(255,255,255,0.5)',
									}}
								>
									{conn.name}
								</span>
								{lit > 0.7 && (
									<div
										style={{
											marginTop: 8,
											fontSize: 11,
											color: COLORS.cyan,
											fontFamily: FONT,
											fontWeight: 600,
										}}
									>
										● connected
									</div>
								)}
							</GlassCard>
						);
					})}
				</div>
			</AbsoluteFill>
		</SceneFade>
	);
};

/* ── Scene 7: Runs While You Sleep (1410–1620) ── */
const SceneCron = () => {
	const frame = useCurrentFrame();
	const {fps} = useVideoConfig();

	const cronSpring = spring({frame: frame - 10, fps, config: {damping: 200}});
	const telegramSpring = spring({frame: frame - 50, fps, config: {damping: 200}});
	const assetSpring = spring({frame: frame - 90, fps, config: {damping: 200}});

	const clockRotation = interpolate(frame, [0, 210], [0, 360]);

	return (
		<SceneFade duration={210}>
			<AbsoluteFill
				style={{
					justifyContent: 'center',
					alignItems: 'center',
					flexDirection: 'column',
					gap: 32,
					padding: 60,
				}}
			>
				<SectionTitle>Runs While You Sleep</SectionTitle>
				<div style={{display: 'flex', gap: 40, alignItems: 'flex-start'}}>
					<GlassCard
						glow
						style={{
							padding: 28,
							width: 280,
							opacity: interpolate(cronSpring, [0, 1], [0, 1]),
							transform: `translateY(${interpolate(cronSpring, [0, 1], [20, 0])}px)`,
						}}
					>
						<div style={{display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16}}>
							<div
								style={{
									width: 40,
									height: 40,
									borderRadius: '50%',
									border: `2px solid ${COLORS.cyan}`,
									display: 'flex',
									alignItems: 'center',
									justifyContent: 'center',
									transform: `rotate(${clockRotation}deg)`,
								}}
							>
								<div
									style={{
										width: 2,
										height: 14,
										background: COLORS.cyan,
										borderRadius: 1,
										transformOrigin: 'bottom center',
										position: 'relative',
										top: -4,
									}}
								/>
							</div>
							<span
								style={{
									fontFamily: FONT,
									fontSize: 16,
									fontWeight: 700,
									color: COLORS.cyan,
								}}
							>
								Scheduled
							</span>
						</div>
						<div
							style={{
								fontFamily: 'monospace',
								fontSize: 15,
								color: COLORS.white,
								background: 'rgba(0,0,0,0.3)',
								padding: '12px 16px',
								borderRadius: 8,
								border: '1px solid rgba(255,255,255,0.08)',
							}}
						>
							<span style={{color: 'rgba(255,255,255,0.4)'}}>cron</span>{' '}
							<span style={{color: COLORS.cyan}}>0 9 * * *</span>
							<div style={{marginTop: 6, fontSize: 13, color: 'rgba(255,255,255,0.6)'}}>
								Daily at 9:00 AM
							</div>
						</div>
					</GlassCard>

					<div style={{display: 'flex', flexDirection: 'column', gap: 12, width: 340}}>
						<GlassCard
							style={{
								padding: '16px 20px',
								opacity: interpolate(telegramSpring, [0, 1], [0, 1]),
								transform: `translateX(${interpolate(telegramSpring, [0, 1], [30, 0])}px)`,
							}}
						>
							<div style={{display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8}}>
								<span style={{fontSize: 18}}>✈️</span>
								<span
									style={{
										fontFamily: FONT,
										fontSize: 13,
										fontWeight: 600,
										color: COLORS.cyan,
									}}
								>
									Telegram Bot
								</span>
							</div>
							<p
								style={{
									fontFamily: FONT,
									fontSize: 14,
									color: 'rgba(255,255,255,0.6)',
									margin: 0,
								}}
							>
								Your daily sneaker ad is ready! 🎬
							</p>
						</GlassCard>
						<GlassCard
							glow
							style={{
								padding: 16,
								opacity: interpolate(assetSpring, [0, 1], [0, 1]),
								transform: `scale(${interpolate(assetSpring, [0, 1], [0.9, 1])})`,
							}}
						>
							<div
								style={{
									width: '100%',
									height: 120,
									borderRadius: 8,
									background: `linear-gradient(135deg, rgba(34,211,238,0.15) 0%, rgba(8,145,178,0.1) 50%, rgba(34,211,238,0.05) 100%)`,
									border: '1px solid rgba(34,211,238,0.2)',
									display: 'flex',
									alignItems: 'center',
									justifyContent: 'center',
									flexDirection: 'column',
									gap: 6,
								}}
							>
								<span style={{fontSize: 32}}>👟</span>
								<span
									style={{
										fontFamily: FONT,
										fontSize: 12,
										color: 'rgba(255,255,255,0.5)',
									}}
								>
									sneaker_ad_15s.mp4
								</span>
							</div>
						</GlassCard>
					</div>
				</div>
			</AbsoluteFill>
		</SceneFade>
	);
};

/* ── Scene 8: Outro (1620–1800) ── */
const SceneOutro = () => {
	const frame = useCurrentFrame();
	const {fps} = useVideoConfig();

	const mainSpring = spring({frame, fps, config: {damping: 180, stiffness: 80}});
	const urlSpring = spring({frame: frame - 25, fps, config: {damping: 200}});

	const glowPulse = interpolate(
		Math.sin(frame / 12),
		[-1, 1],
		[0.4, 0.8],
	);

	return (
		<SceneFade duration={180} fadeOut={0}>
			<AbsoluteFill
				style={{
					justifyContent: 'center',
					alignItems: 'center',
					flexDirection: 'column',
					gap: 24,
				}}
			>
				<div
					style={{
						position: 'absolute',
						width: 500,
						height: 250,
						borderRadius: '50%',
						background: `radial-gradient(circle, rgba(34,211,238,${glowPulse * 0.3}) 0%, transparent 70%)`,
						filter: 'blur(50px)',
					}}
				/>
				<h2
					style={{
						fontFamily: FONT,
						fontSize: 48,
						fontWeight: 900,
						color: COLORS.white,
						letterSpacing: '0.12em',
						margin: 0,
						opacity: interpolate(mainSpring, [0, 1], [0, 1]),
						transform: `scale(${interpolate(mainSpring, [0, 1], [0.9, 1])})`,
						textShadow: `0 0 ${25 + glowPulse * 30}px rgba(34,211,238,${glowPulse * 0.5})`,
					}}
				>
					OPEN SOURCE <span style={{color: COLORS.cyan}}>·</span> MIT
				</h2>
				<p
					style={{
						fontFamily: 'monospace',
						fontSize: 20,
						color: COLORS.cyan,
						margin: 0,
						opacity: interpolate(urlSpring, [0, 1], [0, 1]),
						transform: `translateY(${interpolate(urlSpring, [0, 1], [15, 0])}px)`,
						textShadow: `0 0 20px rgba(34,211,238,0.4)`,
					}}
				>
					github.com/whyujjwal/GenerativeAI-Supercomputer
				</p>
			</AbsoluteFill>
		</SceneFade>
	);
};

/* ── Main composition ── */
export const Promo = () => {
	return (
		<AbsoluteFill style={{fontFamily: FONT}}>
			<Background />
			<Sequence from={0} durationInFrames={180}>
				<SceneTitle />
			</Sequence>
			<Sequence from={180} durationInFrames={270}>
				<SceneChat />
			</Sequence>
			<Sequence from={450} durationInFrames={240}>
				<SceneBrain />
			</Sequence>
			<Sequence from={690} durationInFrames={240}>
				<SceneMemory />
			</Sequence>
			<Sequence from={930} durationInFrames={240}>
				<SceneEmployees />
			</Sequence>
			<Sequence from={1170} durationInFrames={240}>
				<SceneConnected />
			</Sequence>
			<Sequence from={1410} durationInFrames={210}>
				<SceneCron />
			</Sequence>
			<Sequence from={1620} durationInFrames={180}>
				<SceneOutro />
			</Sequence>
		</AbsoluteFill>
	);
};
