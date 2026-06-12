import {Composition} from 'remotion';
import {Promo} from './Promo';

export const RemotionRoot = () => {
	return (
		<>
			<Composition
				id="Promo"
				component={Promo}
				durationInFrames={1800}
				fps={30}
				width={1280}
				height={720}
			/>
		</>
	);
};
